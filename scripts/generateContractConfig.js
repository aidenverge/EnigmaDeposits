const fs = require("fs");
const path = require("path");

const fundraiser = require(path.resolve("deployments/sepolia/EnigmaFundraising.json"));
const cusdt = require(path.resolve("deployments/sepolia/ConfidentialUSDT.json"));

const content = [
  `export const FUNDRAISER_ADDRESS = '${fundraiser.address}';`,
  `export const FUNDRAISER_ABI = ${JSON.stringify(fundraiser.abi, null, 2)} as const;`,
  "",
  `export const CUSDT_ADDRESS = '${cusdt.address}';`,
  `export const CUSDT_ABI = ${JSON.stringify(cusdt.abi, null, 2)} as const;`,
  "",
].join("\n");

fs.writeFileSync(path.resolve("ui/src/config/contracts.ts"), content);
