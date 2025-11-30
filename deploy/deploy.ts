import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, save, getExtendedArtifact } = hre.deployments;

  const cusdt = await deploy("ConfidentialUSDT", {
    from: deployer,
    gasLimit: 6_000_000,
    log: true,
  });

  const fundraiserFactory = await hre.ethers.getContractFactory("EnigmaFundraising");
  const fundraiserContract = await fundraiserFactory.deploy(cusdt.address, {
    gasLimit: 6_000_000,
  });
  const fundraiserDeploymentTx = fundraiserContract.deploymentTransaction();
  const fundraiserReceipt = fundraiserDeploymentTx ? await fundraiserDeploymentTx.wait() : undefined;
  const fundraiserAddress = await fundraiserContract.getAddress();

  const fundraiserArtifact = await getExtendedArtifact("EnigmaFundraising");

  await save("EnigmaFundraising", {
    abi: fundraiserArtifact.abi,
    address: fundraiserAddress,
    transactionHash: fundraiserDeploymentTx?.hash,
    receipt: fundraiserReceipt,
    args: [cusdt.address],
  });

  console.log(`ConfidentialUSDT contract: ${cusdt.address}`);
  console.log(`EnigmaFundraising contract: ${fundraiserAddress}`);
};
export default func;
func.id = "deploy_fundraiser"; // id required to prevent reexecution
func.tags = ["ConfidentialUSDT", "EnigmaFundraising"];
