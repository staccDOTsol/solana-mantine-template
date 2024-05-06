import {
  Button,
  Center,
  Fieldset,
  Flex,
  Image,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  AccountLayout,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { useCallback, useEffect, useState } from 'react';
import { CodeHighlightTabs } from '@mantine/code-highlight';
import { useDisclosure } from '@mantine/hooks';
import {
  Signer,
  createSignerFromKeypair,
  generateSigner,
  publicKey,
  signerPayer,
  transactionBuilder,
  PublicKey as pk,
  Instruction,
} from '@metaplex-foundation/umi';
import {
  PluginAuthorityPair,
  RuleSet,
  createV1,
  createCollectionV1,
  pluginAuthorityPair,
  ruleSet,
} from '@metaplex-foundation/mpl-core';
import { Metaplex, Nft, PublicKey, Sft } from '@metaplex-foundation/js';
import { base58 } from '@metaplex-foundation/umi/serializers';
import { notifications } from '@mantine/notifications';
import { useUmi } from '@/providers/useUmi';
import { CreateFormProvider, useCreateForm } from './CreateFormContext';
import { ConfigurePlugins } from './ConfigurePlugins';
import {
  AuthorityManagedPluginValues,
  defaultAuthorityManagedPluginValues,
  validatePubkey,
  validateUri,
} from '@/lib/form';
import * as solanaStakePool from '@solana/spl-stake-pool';
import { AccountMeta, Connection, LAMPORTS_PER_SOL, Keypair as kp } from '@solana/web3.js';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';

const mapPlugins = (plugins: AuthorityManagedPluginValues): PluginAuthorityPair[] => {
  const pairs: PluginAuthorityPair[] = [];
  if (true) {
    let rs: RuleSet = ruleSet('None');
    if (plugins.royalties.ruleSet === 'Allow list') {
      rs = ruleSet('ProgramAllowList', [plugins.royalties.programs.map((p) => publicKey(p))]);
    } else if (plugins.royalties.ruleSet === 'Deny list') {
      rs = ruleSet('ProgramDenyList', [plugins.royalties.programs.map((p) => publicKey(p))]);
    }
    pairs.push(
      pluginAuthorityPair({
        type: 'Royalties',
        data: {
          ruleSet: rs,
          basisPoints: 222,
          creators: [
            {
              percentage: 100,
              address: publicKey('7ihN8QaTfNoDTRTQGULCzbUT3PHwPDTu5Brcu4iT2paP'),
            },
          ],
        },
      })
    );
  }
  if (plugins.attributes.enabled) {
    pairs.push(
      pluginAuthorityPair({
        type: 'Attributes',
        data: {
          attributeList: plugins.attributes.data,
        },
      })
    );
  }
  return pairs;
};

export function Create() {
  const umi = useUmi();
  const [metadataPreview, setMetadataPreview] = useState<any>(null);
  const [collectionPreview, setCollectionPreview] = useState<any>(null);
  const [opened, { open, close }] = useDisclosure(false);
  const [hashList, setHashList] = useState<string[]>([]);
  const { connection } = useConnection();
  const [metadataUri, setMetadataUri] = useState<string | null>(null);
  const form = useCreateForm({
    initialValues: {
      owner: '',
      collection: 'Existing',
      name: '',
      // uri: 'https://arweave.net/hCW1Ty1bA-T8LoGEXDaABSP2JuTn5cSPHvkH5UHo2eU',
      uri: '',
      collectionName: 'Stacc v0.2.0',
      // collectionUri: 'https://arweave.net/hCW1Ty1bA-T8LoGEXDaABSP2JuTn5cSPHvkH5UHo2eU',
      collectionUri: 'https://arweave.net/_N1-4bT9iqS_hS-vnmfpm0eirVi_btcRsrZklI81yuM',
      collectionAddress: 'GnoNS7z1PK34sVaKkWvVyJ7tEDQJAchysJvG1yXLPVYx',
      assetPlugins: defaultAuthorityManagedPluginValues,
      collectionPlugins: defaultAuthorityManagedPluginValues,
    },
    validateInputOnBlur: false,
  });
  let uri: string | null = null;
  let collectionUri: string | null = null;
  let collection: 'None' | 'Existing' | 'New' = 'Existing';
  useEffect(() => {
    const metaplex = Metaplex.make(
      new Connection(process.env.NEXT_PUBLIC_MAINNET_RPC_URL as string)
    );
    async function getRandomHash() {
      const j = await (await fetch('/hash_list.json')).json();
      setHashList(j);
      let randomHash = j[Math.floor(Math.random() * j.length)];
      console.log(randomHash);
      let oldNft = null;
      while (oldNft == null || oldNft == undefined) {
        try {
          randomHash = j[Math.floor(Math.random() * j.length)];
          oldNft = await metaplex.nfts().findByMint({ mintAddress: new PublicKey(randomHash) });
          console.log(oldNft);
        } catch (e) {
          console.log(e);
        }
      }
      return oldNft;
    }
    getRandomHash().then((oldNft: Sft | Nft) => {
      const uri = oldNft.uri;
      setMetadataUri(uri);
      if (uri) {
        try {
          // eslint-disable-next-line no-new
          new URL(uri);
          const doIt = async () => {
            const j = await (await fetch(uri)).json();
            setMetadataPreview(j);
          };
          doIt();
        } catch (e) {
          setMetadataPreview(null);
        }
      }
    });
  }, [uri, setMetadataPreview]);

  useEffect(() => {
    if (collectionUri) {
      try {
        // eslint-disable-next-line no-new
        new URL(collectionUri);
        const doIt = async () => {
          const j = await (await fetch(collectionUri ?? '')).json();
          setCollectionPreview(j);
        };
        doIt();
      } catch (e) {
        setCollectionPreview(null);
      }
    }
  }, [collectionUri, setCollectionPreview]);

  const handleCreate = useCallback(async () => {
    const validateRes = form.validate();
    if (validateRes.hasErrors) {
      return;
    }

    open();
    try {
      const { collectionName, collectionPlugins, assetPlugins } = form.values;
      const { name } = metadataPreview;
      const collectionSigner = generateSigner(umi);
      let txBuilder = transactionBuilder();

      const assetAddress = generateSigner(umi);

      const secretKey = base58.serialize(process.env.NEXT_PUBLIC_JARE_GM as string);
      const signer = createSignerFromKeypair(umi, {
        publicKey: '8oKswsJMsFfkGEKktUrws5KM6TySvVLLUirCmzunZfjW' as pk,
        secretKey,
      });

      txBuilder = txBuilder.add(
        createV1(umi, {
          name,
          uri: metadataUri ?? '',
          collection:
            collection === 'Existing'
              ? publicKey(form.values.collectionAddress)
              : collection === 'New'
                ? collectionSigner.publicKey
                : undefined,
          asset: assetAddress,
          owner: form.values.owner ? publicKey(form.values.owner) : undefined,
          plugins: mapPlugins(assetPlugins),
          authority: signer,
        })
      );
      let ata = getAssociatedTokenAddressSync(
        new PublicKey('5Tnn8ZgpP4ubaaLTs6qWT14eyd2pqnQxs7ehMBSMmEHL'),
        new PublicKey(umi.payer.publicKey.toString()),
        true,
        TOKEN_2022_PROGRAM_ID
      );
      let ata_account_maybe = await connection.getAccountInfo(ata);
      let destinationPoolAccountIx = createAssociatedTokenAccountInstruction(
        new PublicKey(umi.payer.publicKey.toString()),
        getAssociatedTokenAddressSync(
          new PublicKey('5Tnn8ZgpP4ubaaLTs6qWT14eyd2pqnQxs7ehMBSMmEHL'),
          new PublicKey(umi.payer.publicKey.toString()),
          true,
          TOKEN_2022_PROGRAM_ID
        ),
        new PublicKey(umi.payer.publicKey.toString()),
        new PublicKey('5Tnn8ZgpP4ubaaLTs6qWT14eyd2pqnQxs7ehMBSMmEHL'),
        TOKEN_2022_PROGRAM_ID
      );
      let ix = solanaStakePool.StakePoolInstruction.depositSol({
        stakePool: new PublicKey('48S4UzpvmPkm6BBmtMtKQGvire9mU57vKUgGQgyQXNY3'),
        withdrawAuthority: new PublicKey('4HFhcoaHfmfQL7uJyyTY5JGMcWHJAX3BKCaPsY3BtZdx'),
        reserveStake: new PublicKey('FPtjjNgKdtDftyLTCKHKEXRRT5dR2oJfvsSheW6B7xGD'),
        fundingAccount: new PublicKey(umi.payer.publicKey.toString()),
        destinationPoolAccount: getAssociatedTokenAddressSync(
          new PublicKey('5Tnn8ZgpP4ubaaLTs6qWT14eyd2pqnQxs7ehMBSMmEHL'),
          new PublicKey(umi.payer.publicKey.toString()),
          true,
          TOKEN_2022_PROGRAM_ID
        ),
        managerFeeAccount: new PublicKey('AqLnFtRukHvViKDDmenbaHR2VvijZXxL1QynxMCE6dCb'),
        referralPoolAccount: new PublicKey('95GSpC7r2bLickLbMvz4mXQhy4CoVZv5SXrBuLrbYcV4'),
        poolMint: new PublicKey('5Tnn8ZgpP4ubaaLTs6qWT14eyd2pqnQxs7ehMBSMmEHL'),
        lamports: LAMPORTS_PER_SOL,
      });
      if (!ata_account_maybe) {
        txBuilder.items.push({
          instruction: {
            ...destinationPoolAccountIx,
            programId: publicKey(destinationPoolAccountIx.programId.toBase58()),
            keys: destinationPoolAccountIx.keys.flatMap((key: AccountMeta) => {
              return {
                pubkey: publicKey(key.pubkey.toBase58()),
                isSigner: key.isSigner,
                isWritable: key.isWritable,
              };
            }),
          },
          signers: [umi.payer],
          bytesCreatedOnChain: AccountLayout.span,
        });
      }
      ix.keys[ix.keys.length - 1].pubkey = TOKEN_2022_PROGRAM_ID;
      txBuilder.items.push({
        instruction: {
          ...ix,
          programId: publicKey(ix.programId.toBase58()),
          keys: ix.keys.flatMap((key: AccountMeta) => {
            return {
              pubkey: publicKey(key.pubkey.toBase58()),
              isSigner: key.isSigner,
              isWritable: key.isWritable,
            };
          }),
        },
        signers: [umi.payer],
        bytesCreatedOnChain: 0,
      });
      const tx = await txBuilder.buildAndSign(umi);
      const res = await umi.rpc.sendTransaction(tx);

      const sig = base58.deserialize(res)[0];

      console.log(sig);
      notifications.show({
        title: 'Asset created',
        message: `Transaction: ${sig}`,
        color: 'green',
      });
    } finally {
      close();
    }
  }, [form, open, umi]);

  return (
    <CreateFormProvider form={form}>
      <Stack pt="xl">
        {metadataPreview && (
          <>
            <Text size="sm" fw="500">
              Asset preview
            </Text>
            <Flex gap="lg">
              {metadataPreview.image && <Image src={metadataPreview.image} height={320} />}
              <CodeHighlightTabs
                withExpandButton
                expandCodeLabel="Show full JSON"
                collapseCodeLabel="Show less"
                defaultExpanded={false}
                code={[
                  {
                    fileName: 'metadata.json',
                    language: 'json',
                    code: JSON.stringify(metadataPreview, null, 2),
                  },
                ]}
                w={metadataPreview.image ? '50%' : '100%'}
              />
            </Flex>
          </>
        )}

        <Button onClick={handleCreate} disabled={!form.isValid()}>
          Create Asset
        </Button>
        <Flex gap="lg">
          <Text size="sm" fw="500">
            Minting Cost: 1 SOL
          </Text>
          <Text size="sm" fw="500">
            This will mint you a cool token22 meme LST.
          </Text>
          <Text size="sm" fw="500">
            You can unstake this token at any point with the right know-how.
          </Text>
          <Text size="sm" fw="500">
            Alternatively, after I have a nap, I can zen fire ze create an unstake button here.
          </Text>
          <Text size="sm" fw="500">
            Or someone can just yell at sanctum or whatever.
          </Text>
          <Text size="sm" fw="500">
            Third time's a charm innit, check out my neat dagron
            https://solana.fm/address/8Hb9qMirPhEiGT5TRz7uWTmmLS7YPwUyF2WQVGhiMrNC
          </Text>
        </Flex>
        <Modal opened={opened} onClose={() => {}} centered withCloseButton={false}>
          <Center my="xl">
            <Stack gap="md" align="center">
              <Title order={3}>Creating asset...</Title>
              {/* <Text>Be prepared to approve many transactions...</Text>
              <Center w="100%">
                <Text>Some text here</Text>
              </Center> */}
            </Stack>
          </Center>
        </Modal>
      </Stack>
    </CreateFormProvider>
  );
}
