import { useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Contract } from 'ethers';
import { Header } from './Header';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { FUNDRAISER_ADDRESS, FUNDRAISER_ABI, CUSDT_ADDRESS, CUSDT_ABI } from '../config/contracts';
import '../styles/Fundraiser.css';

// const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_HANDLE = '0x0000000000000000000000000000000000000000000000000000000000000000';

type FundraiserDetails = {
  name: string;
  target: number;
  endTime: number;
  ended: boolean;
  owner: string;
};

const formatDateTime = (timestamp: number) => {
  if (!timestamp) return 'Not set';
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
};

const shortenHandle = (value?: string | bigint) => {
  if (!value) return '';
  const strValue = value.toString();
  if (strValue.length <= 12) return strValue;
  return `${strValue.slice(0, 10)}...${strValue.slice(-6)}`;
};

export function FundraiserApp() {
  const { address } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [prefilled, setPrefilled] = useState(false);
  const [fundraiserName, setFundraiserName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [endTimeInput, setEndTimeInput] = useState('');
  const [contributionAmount, setContributionAmount] = useState('');
  const [mintAmount, setMintAmount] = useState('1000000');
  const [operatorDays, setOperatorDays] = useState('30');

  const [decryptingContribution, setDecryptingContribution] = useState(false);
  const [decryptingTotal, setDecryptingTotal] = useState(false);
  const [decryptingBalance, setDecryptingBalance] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [isContributing, setIsContributing] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  const [myContribution, setMyContribution] = useState<string | null>(null);
  const [totalRaised, setTotalRaised] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string>('');

  const hasDeployments = true;

  const { data: detailsData } = useReadContract({
    address: FUNDRAISER_ADDRESS as `0x${string}`,
    abi: FUNDRAISER_ABI,
    functionName: 'getFundraiserDetails',
    query: { enabled: hasDeployments },
  });

  const { data: isActiveData } = useReadContract({
    address: FUNDRAISER_ADDRESS as `0x${string}`,
    abi: FUNDRAISER_ABI,
    functionName: 'isActive',
    query: { enabled: hasDeployments },
  });

  const { data: totalHandle, refetch: refetchTotal } = useReadContract({
    address: FUNDRAISER_ADDRESS as `0x${string}`,
    abi: FUNDRAISER_ABI,
    functionName: 'confidentialTotalRaised',
    query: { enabled: hasDeployments },
  });

  const { data: contributionHandle, refetch: refetchContribution } = useReadContract({
    address: FUNDRAISER_ADDRESS as `0x${string}`,
    abi: FUNDRAISER_ABI,
    functionName: 'contributionOf',
    args: address && hasDeployments ? [address] : undefined,
    query: { enabled: !!address && hasDeployments },
  });

  const { data: balanceHandle, refetch: refetchBalance } = useReadContract({
    address: CUSDT_ADDRESS as `0x${string}`,
    abi: CUSDT_ABI,
    functionName: 'confidentialBalanceOf',
    args: address && hasDeployments ? [address] : undefined,
    query: { enabled: !!address && hasDeployments },
  });

  const fundraiserDetails: FundraiserDetails | null = useMemo(() => {
    if (!detailsData) return null;
    const [name, target, endTime, ended, owner] = detailsData as [
      string,
      bigint,
      bigint,
      boolean,
      string
    ];
    return {
      name,
      target: Number(target),
      endTime: Number(endTime),
      ended,
      owner,
    };
  }, [detailsData]);

  const isOwner =
    address &&
    fundraiserDetails?.owner &&
    address.toLowerCase() === fundraiserDetails.owner.toLowerCase();

  useEffect(() => {
    if (fundraiserDetails && !prefilled) {
      setFundraiserName(fundraiserDetails.name);
      setTargetAmount(fundraiserDetails.target ? String(fundraiserDetails.target) : '');
      if (fundraiserDetails.endTime) {
        setEndTimeInput(new Date(fundraiserDetails.endTime * 1000).toISOString().slice(0, 16));
      }
      setPrefilled(true);
    }
  }, [fundraiserDetails, prefilled]);

  const ensureSigner = async () => {
    const signer = await signerPromise;
    if (!signer) {
      throw new Error('Connect your wallet to continue.');
    }
    return signer;
  };

  const handleConfigure = async () => {
    if (!hasDeployments) {
      setActionNote('Deployments are missing. Please deploy contracts and regenerate config.');
      return;
    }
    try {
      setSavingConfig(true);
      setActionNote('');
      const signer = await ensureSigner();
      const endTimestamp = Math.floor(new Date(endTimeInput).getTime() / 1000);
      const targetValue = Number(targetAmount);
      if (!fundraiserName || !targetValue || !endTimestamp) {
        throw new Error('All fields are required.');
      }

      const contract = new Contract(FUNDRAISER_ADDRESS, FUNDRAISER_ABI, signer);
      const tx = await contract.configureFundraiser(
        fundraiserName.trim(),
        BigInt(targetValue),
        BigInt(endTimestamp)
      );
      await tx.wait();
      setActionNote('Fundraiser details updated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update fundraiser.';
      setActionNote(message);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleMint = async () => {
    if (!hasDeployments) return;
    try {
      setIsMinting(true);
      setActionNote('');
      const signer = await ensureSigner();
      const contract = new Contract(CUSDT_ADDRESS, CUSDT_ABI, signer);
      const amount = BigInt(mintAmount || '0');
      if (amount <= 0) throw new Error('Amount must be greater than zero.');
      const tx = await contract.mint(signer.address, amount);
      await tx.wait();
      setActionNote('cUSDT minted to your wallet.');
      await refetchBalance?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Mint failed.';
      setActionNote(message);
    } finally {
      setIsMinting(false);
    }
  };

  const handleSetOperator = async () => {
    if (!hasDeployments) return;
    try {
      setIsAuthorizing(true);
      setActionNote('');
      const signer = await ensureSigner();
      const contract = new Contract(CUSDT_ADDRESS, CUSDT_ABI, signer);
      const days = Number(operatorDays || '0');
      const expiresAt = Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
      if (!expiresAt) throw new Error('Choose a valid duration.');
      const tx = await contract.setOperator(FUNDRAISER_ADDRESS, expiresAt);
      await tx.wait();
      setActionNote('Fundraiser authorized to move your cUSDT.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authorization failed.';
      setActionNote(message);
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleContribute = async () => {
    if (!hasDeployments || !instance) return;
    try {
      setIsContributing(true);
      setActionNote('');
      const signer = await ensureSigner();
      const amount = BigInt(contributionAmount || '0');
      if (amount <= 0) throw new Error('Enter a contribution amount.');

      const input = instance.createEncryptedInput(CUSDT_ADDRESS, FUNDRAISER_ADDRESS);
      input.add64(amount);
      const encrypted = await input.encrypt();

      const contract = new Contract(FUNDRAISER_ADDRESS, FUNDRAISER_ABI, signer);
      const tx = await contract.contribute(encrypted.handles[0], encrypted.inputProof);
      await tx.wait();
      setActionNote('Contribution submitted securely.');
      setContributionAmount('');
      await Promise.all([refetchContribution?.(), refetchTotal?.(), refetchBalance?.()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Contribution failed.';
      setActionNote(message);
    } finally {
      setIsContributing(false);
    }
  };

  const handleDecryptContribution = async () => {
    if (!instance || !address || !contributionHandle) return;
    try {
      setDecryptingContribution(true);
      const handleValue = contributionHandle as string;
      if (handleValue === ZERO_HANDLE) {
        setActionNote('No contribution found to decrypt.');
        return;
      }
      const keypair = instance.generateKeypair();
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const contractAddresses = [FUNDRAISER_ADDRESS];

      const eip712 = instance.createEIP712(
        keypair.publicKey,
        contractAddresses,
        startTimeStamp,
        durationDays
      );

      const signer = await ensureSigner();
      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message
      );

      const result = await instance.userDecrypt(
        [{ handle: handleValue, contractAddress: FUNDRAISER_ADDRESS }],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays
      );

      const clearValue = result[handleValue];
      setMyContribution(clearValue ? clearValue.toString() : '0');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to decrypt.';
      setActionNote(message);
    } finally {
      setDecryptingContribution(false);
    }
  };

  const handleDecryptTotal = async () => {
    if (!instance || !address || !isOwner || !totalHandle) return;
    try {
      setDecryptingTotal(true);
      const handleValue = totalHandle as string;
      if (handleValue === ZERO_HANDLE) {
        setActionNote('Total raised is still zero.');
        return;
      }
      const keypair = instance.generateKeypair();
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const contractAddresses = [FUNDRAISER_ADDRESS];

      const eip712 = instance.createEIP712(
        keypair.publicKey,
        contractAddresses,
        startTimeStamp,
        durationDays
      );

      const signer = await ensureSigner();
      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message
      );

      const result = await instance.userDecrypt(
        [{ handle: handleValue, contractAddress: FUNDRAISER_ADDRESS }],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays
      );

      const clearValue = result[handleValue];
      setTotalRaised(clearValue ? clearValue.toString() : '0');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to decrypt total.';
      setActionNote(message);
    } finally {
      setDecryptingTotal(false);
    }
  };

  const handleDecryptBalance = async () => {
    if (!instance || !address || !balanceHandle) return;
    try {
      setDecryptingBalance(true);
      const handleValue = balanceHandle as string;
      if (handleValue === ZERO_HANDLE) {
        setActionNote('No cUSDT balance to decrypt yet.');
        return;
      }
      const keypair = instance.generateKeypair();
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const contractAddresses = [CUSDT_ADDRESS];

      const eip712 = instance.createEIP712(
        keypair.publicKey,
        contractAddresses,
        startTimeStamp,
        durationDays
      );

      const signer = await ensureSigner();
      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message
      );

      const result = await instance.userDecrypt(
        [{ handle: handleValue as string, contractAddress: CUSDT_ADDRESS }],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays
      );

      const clearValue = result[handleValue as string];
      setBalance(clearValue ? clearValue.toString() : '0');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to decrypt balance.';
      setActionNote(message);
    } finally {
      setDecryptingBalance(false);
    }
  };

  const handleEndFundraiser = async () => {
    if (!hasDeployments) return;
    try {
      setIsEnding(true);
      setActionNote('');
      const signer = await ensureSigner();
      const contract = new Contract(FUNDRAISER_ADDRESS, FUNDRAISER_ABI, signer);
      const tx = await contract.endFundraiser();
      await tx.wait();
      setActionNote('Fundraiser closed and funds released.');
      await refetchTotal?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to end fundraiser.';
      setActionNote(message);
    } finally {
      setIsEnding(false);
    }
  };

  const statusLabel = useMemo(() => {
    if (!hasDeployments) return 'Awaiting deployment';
    if (!fundraiserDetails) return 'Not configured';
    if (fundraiserDetails.ended) return 'Closed';
    if (isActiveData) return 'Open';
    return 'Scheduled';
  }, [fundraiserDetails, hasDeployments, isActiveData]);

  const statusClass = useMemo(() => {
    const label = statusLabel.toLowerCase();
    if (label.includes('await')) return 'awaiting';
    if (label.includes('open')) return 'open';
    if (label.includes('closed')) return 'closed';
    return 'scheduled';
  }, [statusLabel]);

  return (
    <div className="app-shell">
      <Header />
      <div className="content-shell">
        <section className="hero">
          <div>
            <p className="eyebrow">Confidential fundraiser</p>
            <h1 className="hero-title">
              {fundraiserDetails?.name || 'Set your campaign name'}
            </h1>
            <p className="hero-subtitle">
              Raise cUSDT with encrypted amounts powered by Zama FHE. Contributors keep their pledges private while you track totals securely.
            </p>
          </div>
          <div className="status-card">
            <div className="status-row">
              <span>Status</span>
              <span className={`pill ${statusClass}`}>{statusLabel}</span>
            </div>
            <div className="status-grid">
              <div>
                <p className="label">Target</p>
                <p className="value">{fundraiserDetails ? fundraiserDetails.target : '0'} cUSDT</p>
              </div>
              <div>
                <p className="label">Ends</p>
                <p className="value">{fundraiserDetails ? formatDateTime(fundraiserDetails.endTime) : 'Not set'}</p>
              </div>
              <div>
                <p className="label">Owner</p>
                <p className="value mono">{fundraiserDetails?.owner ? shortenHandle(fundraiserDetails.owner) : 'Not set'}</p>
              </div>
            </div>
          </div>
        </section>

        {!hasDeployments ? (
          <div className="warning-banner">
            The deployments folder is using placeholder addresses. Deploy the contracts to Sepolia and rerun
            <code> node scripts/generateContractConfig.js </code>
            to sync addresses for the UI and tasks.
          </div>
        ) : null}

        {zamaError ? <div className="warning-banner">{zamaError}</div> : null}

        <section className="grid-two">
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Contribute</p>
                <h3>Send encrypted cUSDT</h3>
              </div>
              <span className="pill neutral">Zama ready {zamaLoading ? '• loading' : '• online'}</span>
            </div>
            <div className="form-grid">
              <label>
                Amount (plain number)
                <input
                  type="number"
                  min="0"
                  value={contributionAmount}
                  onChange={(e) => setContributionAmount(e.target.value)}
                  placeholder="e.g. 2500000 for 2.5 cUSDT"
                />
              </label>
              <button
                className="primary-btn"
                onClick={handleContribute}
                disabled={isContributing || zamaLoading || !hasDeployments || !instance}
              >
                {isContributing ? 'Encrypting...' : 'Contribute privately'}
              </button>
            </div>

            <div className="divider" />

            <div className="info-row">
              <div>
                <p className="label">Your encrypted pledge</p>
                <p className="value mono">{shortenHandle(contributionHandle as string)}</p>
              </div>
              <button
                className="ghost-btn"
                onClick={handleDecryptContribution}
                disabled={decryptingContribution || !contributionHandle || !instance}
              >
                {decryptingContribution ? 'Decrypting...' : 'Decrypt my amount'}
              </button>
            </div>

            <div className="info-row">
              <div>
                <p className="label">Your cUSDT balance (encrypted)</p>
                <p className="value mono">{shortenHandle(balanceHandle as string)}</p>
              </div>
              <button
                className="ghost-btn"
                onClick={handleDecryptBalance}
                disabled={decryptingBalance || !balanceHandle || !instance}
              >
                {decryptingBalance ? 'Decrypting...' : 'Decrypt balance'}
              </button>
            </div>

            <div className="pill note">
              {myContribution !== null ? `You contributed ${myContribution} units.` : 'Decrypt to reveal your pledge.'}
            </div>
            <div className="pill note">
              {balance !== null ? `Your cUSDT balance: ${balance}` : 'Balances stay encrypted until you decrypt.'}
            </div>
          </div>

          <div className="panel muted">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Get ready</p>
                <h3>Mint & authorize cUSDT</h3>
              </div>
            </div>
            <div className="form-grid">
              <label>
                Mint amount
                <input
                  type="number"
                  min="0"
                  value={mintAmount}
                  onChange={(e) => setMintAmount(e.target.value)}
                  placeholder="e.g. 1000000"
                />
              </label>
              <button
                className="secondary-btn"
                onClick={handleMint}
                disabled={isMinting || !hasDeployments}
              >
                {isMinting ? 'Minting...' : 'Mint test cUSDT'}
              </button>
            </div>

            <div className="form-grid">
              <label>
                Operator duration (days)
                <input
                  type="number"
                  min="1"
                  value={operatorDays}
                  onChange={(e) => setOperatorDays(e.target.value)}
                />
              </label>
              <button
                className="secondary-btn"
                onClick={handleSetOperator}
                disabled={isAuthorizing || !hasDeployments}
              >
                {isAuthorizing ? 'Authorizing...' : 'Authorize fundraiser'}
              </button>
            </div>
            <p className="helper">
              Authorize the fundraiser contract as your operator so it can pull encrypted amounts with <code>confidentialTransferFrom</code>.
            </p>
          </div>
        </section>

        <section className="grid-two">
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Campaign totals</p>
                <h3>Encrypted progress</h3>
              </div>
              <div className="badge-stack">
                <span className="pill soft">Total handle</span>
                <span className="pill muted">{shortenHandle(totalHandle as string)}</span>
              </div>
            </div>
            <div className="stats">
              <div>
                <p className="label">Decrypted total</p>
                <p className="hero-total">{totalRaised ?? 'Hidden'}</p>
              </div>
              <div>
                <p className="label">Status</p>
                <p className="value">{statusLabel}</p>
              </div>
            </div>
            <button
              className="ghost-btn"
              onClick={handleDecryptTotal}
              disabled={!isOwner || decryptingTotal || !instance}
            >
              {decryptingTotal ? 'Decrypting...' : 'Owner decrypt total'}
            </button>
          </div>

          <div className="panel muted">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Manage fundraiser</p>
                <h3>Owner controls</h3>
              </div>
              <span className="pill neutral">{isOwner ? 'You are the owner' : 'Read only'}</span>
            </div>

            <div className="form-grid">
              <label>
                Name
                <input
                  type="text"
                  value={fundraiserName}
                  onChange={(e) => setFundraiserName(e.target.value)}
                  placeholder="Confidential Round"
                />
              </label>
              <label>
                Target amount
                <input
                  type="number"
                  min="1"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  placeholder="100000000"
                />
              </label>
              <label>
                End time
                <input
                  type="datetime-local"
                  value={endTimeInput}
                  onChange={(e) => setEndTimeInput(e.target.value)}
                />
              </label>
              <div className="actions-row">
                <button
                  className="secondary-btn"
                  onClick={handleConfigure}
                  disabled={!isOwner || savingConfig || !hasDeployments}
                >
                  {savingConfig ? 'Saving...' : 'Save config'}
                </button>
                <button
                  className="danger-btn"
                  onClick={handleEndFundraiser}
                  disabled={!isOwner || isEnding || !hasDeployments}
                >
                  {isEnding ? 'Ending...' : 'End fundraiser'}
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="note-bar">
          <div>
            <p className="label">Updates</p>
            <p className="value">{actionNote || 'All interactions use ethers for writes and viem for reads.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
