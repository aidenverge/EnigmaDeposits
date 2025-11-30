import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:fundraiser-address", "Prints deployed contract addresses").setAction(async function (_taskArguments, hre) {
  const cusdt = await hre.deployments.get("ConfidentialUSDT");
  const fundraiser = await hre.deployments.get("EnigmaFundraising");

  console.log(`ConfidentialUSDT: ${cusdt.address}`);
  console.log(`EnigmaFundraising: ${fundraiser.address}`);
});

task("task:configure-fundraiser", "Updates fundraiser details")
  .addParam("name", "Fundraiser name")
  .addParam("target", "Target amount (plain uint64)")
  .addParam("end", "End timestamp (seconds)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const fundraiserDeployment = await deployments.get("EnigmaFundraising");
    const fundraiser = await ethers.getContractAt("EnigmaFundraising", fundraiserDeployment.address);

    const target = BigInt(taskArguments.target);
    const end = BigInt(taskArguments.end);

    const tx = await fundraiser.configureFundraiser(taskArguments.name, target, end);
    console.log(`Configuring fundraiser ${taskArguments.name}...`);
    await tx.wait();
    console.log("Configuration saved");
  });

task("task:mint-cusdt", "Mints test cUSDT")
  .addParam("to", "Recipient")
  .addParam("amount", "Plain amount to mint")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const cusdtDeployment = await deployments.get("ConfidentialUSDT");
    const cusdt = await ethers.getContractAt("ConfidentialUSDT", cusdtDeployment.address);

    const tx = await cusdt.mint(taskArguments.to, BigInt(taskArguments.amount));
    console.log(`Minting ${taskArguments.amount} cUSDT to ${taskArguments.to}...`);
    await tx.wait();
    console.log("Mint completed");
  });

task("task:contribute", "Makes an encrypted contribution")
  .addParam("amount", "Plain amount to contribute")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const fundraiserDeployment = await deployments.get("EnigmaFundraising");
    const fundraiserAddress = fundraiserDeployment.address;
    const fundraiser = await ethers.getContractAt("EnigmaFundraising", fundraiserAddress);
    const [signer] = await ethers.getSigners();

    const input = fhevm.createEncryptedInput(fundraiserAddress, signer.address);
    input.add64(BigInt(taskArguments.amount));
    const encrypted = await input.encrypt();

    const tx = await fundraiser
      .connect(signer)
      .contribute(encrypted.handles[0], encrypted.inputProof);

    console.log(`Contributing ${taskArguments.amount} cUSDT...`);
    await tx.wait();
    console.log("Contribution sent");
  });

task("task:decrypt-contribution", "Decrypts the caller contribution")
  .addOptionalParam("user", "Contributor address (defaults to signer)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const fundraiserDeployment = await deployments.get("EnigmaFundraising");
    const fundraiserAddress = fundraiserDeployment.address;
    const fundraiser = await ethers.getContractAt("EnigmaFundraising", fundraiserAddress);
    const [signer] = await ethers.getSigners();
    const contributor = taskArguments.user ?? signer.address;

    const encryptedContribution = await fundraiser.contributionOf(contributor);
    const clearContribution = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedContribution,
      fundraiserAddress,
      signer,
    );

    console.log(`Contribution for ${contributor}: ${clearContribution.toString()}`);
  });

task("task:decrypt-total", "Decrypts the total raised amount").setAction(async function (_taskArguments, hre) {
  const { ethers, deployments, fhevm } = hre;
  await fhevm.initializeCLIApi();

  const fundraiserDeployment = await deployments.get("EnigmaFundraising");
  const fundraiserAddress = fundraiserDeployment.address;
  const fundraiser = await ethers.getContractAt("EnigmaFundraising", fundraiserAddress);
  const [signer] = await ethers.getSigners();

  const encryptedTotal = await fundraiser.confidentialTotalRaised();
  const clearTotal = await fhevm.userDecryptEuint(
    FhevmType.euint64,
    encryptedTotal,
    fundraiserAddress,
    signer,
  );

  console.log(`Total raised: ${clearTotal.toString()}`);
});
