import hre from "hardhat";

async function main() {
  await hre.fhevm.initializeCLIApi();

  const cusdtFactory = await hre.ethers.getContractFactory("ConfidentialUSDT");
  const cusdt = await cusdtFactory.deploy();
  await cusdt.waitForDeployment();

  const fundraiserFactory = await hre.ethers.getContractFactory("EnigmaFundraising");
  const fundraiser = await fundraiserFactory.deploy(await cusdt.getAddress());
  await fundraiser.waitForDeployment();

  console.log("ConfidentialUSDT:", await cusdt.getAddress());
  console.log("EnigmaFundraising:", await fundraiser.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
