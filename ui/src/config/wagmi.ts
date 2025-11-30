import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Enigma Deposits',
  projectId: '2d1a3f5c4b624c7f9e3d7b1a4f6c9e12',
  chains: [sepolia],
  ssr: false,
});
