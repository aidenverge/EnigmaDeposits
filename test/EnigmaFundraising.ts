import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { ConfidentialUSDT, ConfidentialUSDT__factory, EnigmaFundraising, EnigmaFundraising__factory } from "../types";

type Signers = {
  owner: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFundraiser() {
  const [owner, alice, bob] = await ethers.getSigners();

  const cusdtFactory = (await ethers.getContractFactory("ConfidentialUSDT")) as ConfidentialUSDT__factory;
  const cusdt = (await cusdtFactory.deploy()) as ConfidentialUSDT;
  const cusdtAddress = await cusdt.getAddress();

  const fundraiserFactory = (await ethers.getContractFactory("EnigmaFundraising")) as EnigmaFundraising__factory;
  const fundraiser = (await fundraiserFactory.deploy(cusdtAddress)) as EnigmaFundraising;
  const fundraiserAddress = await fundraiser.getAddress();

  const latestBlock = await ethers.provider.getBlock("latest");
  const endTimestamp = BigInt((latestBlock?.timestamp ?? 0) + 3600);

  await fundraiser.configureFundraiser("Confidential Round", 1_000, endTimestamp);

  return { cusdt, cusdtAddress, fundraiser, fundraiserAddress, endTimestamp, signers: { owner, alice, bob } };
}

describe("EnigmaFundraising", function () {
  let signers: Signers;
  let cusdt: ConfidentialUSDT;
  let cusdtAddress: string;
  let fundraiser: EnigmaFundraising;
  let fundraiserAddress: string;

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }
    ({ cusdt, cusdtAddress, fundraiser, fundraiserAddress, signers } = await deployFundraiser());
  });

  it("stores fundraiser configuration", async function () {
    const details = await fundraiser.getFundraiserDetails();
    expect(details[0]).to.eq("Confidential Round");
    expect(details[1]).to.eq(1_000);
    expect(details[3]).to.eq(false);
  });

  it("tracks encrypted contributions per user and total", async function () {
    const expiry = Math.floor(Date.now() / 1000) + 10_000;

    await cusdt.mint(signers.alice.address, 500);
    await cusdt.mint(signers.bob.address, 700);

    await cusdt.connect(signers.alice).setOperator(fundraiserAddress, expiry);
    await cusdt.connect(signers.bob).setOperator(fundraiserAddress, expiry);

    const aliceInput = fhevm.createEncryptedInput(cusdtAddress, fundraiserAddress);
    aliceInput.add64(120n);
    const encryptedAlice = await aliceInput.encrypt();
    await fundraiser.connect(signers.alice).contribute(encryptedAlice.handles[0], encryptedAlice.inputProof);

    const bobInput = fhevm.createEncryptedInput(cusdtAddress, fundraiserAddress);
    bobInput.add64(230n);
    const encryptedBob = await bobInput.encrypt();
    await fundraiser.connect(signers.bob).contribute(encryptedBob.handles[0], encryptedBob.inputProof);

    const aliceContribution = await fundraiser.contributionOf(signers.alice.address);
    const bobContribution = await fundraiser.contributionOf(signers.bob.address);
    const totalRaised = await fundraiser.confidentialTotalRaised();

    const clearAlice = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      aliceContribution,
      fundraiserAddress,
      signers.alice,
    );
    const clearBob = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      bobContribution,
      fundraiserAddress,
      signers.bob,
    );
    const clearTotal = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      totalRaised,
      fundraiserAddress,
      signers.owner,
    );

    expect(clearAlice).to.eq(120n);
    expect(clearBob).to.eq(230n);
    expect(clearTotal).to.eq(350n);
  });

  it("lets fundraiser owner end the round and receive collected cUSDT", async function () {
    const expiry = Math.floor(Date.now() / 1000) + 10_000;

    await cusdt.mint(signers.alice.address, 400);
    await cusdt.connect(signers.alice).setOperator(fundraiserAddress, expiry);

    const aliceInput = fhevm.createEncryptedInput(cusdtAddress, fundraiserAddress);
    aliceInput.add64(300n);
    const encryptedAlice = await aliceInput.encrypt();
    await fundraiser.connect(signers.alice).contribute(encryptedAlice.handles[0], encryptedAlice.inputProof);

    await fundraiser.connect(signers.owner).endFundraiser();

    const ownerBalance = await cusdt.confidentialBalanceOf(signers.owner.address);
    const clearOwnerBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ownerBalance,
      await cusdt.getAddress(),
      signers.owner,
    );

    expect(clearOwnerBalance >= 300n).to.equal(true);
    expect(await fundraiser.isEnded()).to.equal(true);
  });
});
