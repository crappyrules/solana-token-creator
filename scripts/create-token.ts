import { 
    Connection, 
    Keypair, 
    PublicKey,
    sendAndConfirmTransaction,
    Transaction,
    SystemProgram,
    LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { 
    createMint,
    getOrCreateAssociatedTokenAccount,
    mintTo,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getMinimumBalanceForRentExemptMint,
    createSetAuthorityInstruction,
    AuthorityType,
} from '@solana/spl-token';
import {
    DataV2,
    createCreateMetadataAccountV3Instruction,
    PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID
} from '@metaplex-foundation/mpl-token-metadata';
import * as bs58 from 'bs58';

// Token configuration
const TOKEN_CONFIG = {
    name: process.env.TOKEN_NAME || "My Token",
    symbol: process.env.TOKEN_SYMBOL || "MTK",
    description: process.env.TOKEN_DESCRIPTION || "My custom token on Solana",
    decimals: Number(process.env.TOKEN_DECIMALS) || 9,
    totalSupply: BigInt(process.env.TOKEN_SUPPLY || "1000000000"), // 1 billion as default
    uri: process.env.TOKEN_URI || "", // Metadata URI (optional)
};

async function getMetadataAddress(mint: PublicKey): Promise<PublicKey> {
    const [metadataAddress] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('metadata'),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID
    );
    return metadataAddress;
}

async function checkBalance(connection: Connection, payer: PublicKey, neededAmount: number) {
    const balance = await connection.getBalance(payer);
    if (balance < neededAmount) {
        throw new Error(`Insufficient balance. Has ${balance/LAMPORTS_PER_SOL} SOL, needs ${neededAmount/LAMPORTS_PER_SOL} SOL`);
    }
}

async function createTokenMetadata(
    connection: Connection,
    payer: Keypair,
    mint: PublicKey,
) {
    // Check balance before metadata creation
    await checkBalance(connection, payer.publicKey, 15200000); // ~0.0152 SOL to be safe
    
    const metadataAddress = await getMetadataAddress(mint);

    const instruction = createCreateMetadataAccountV3Instruction(
        {
            metadata: metadataAddress,
            mint,
            mintAuthority: payer.publicKey,
            payer: payer.publicKey,
            updateAuthority: payer.publicKey,
        },
        {
            createMetadataAccountArgsV3: {
                data: {
                    name: TOKEN_CONFIG.name,
                    symbol: TOKEN_CONFIG.symbol,
                    uri: TOKEN_CONFIG.uri,
                    sellerFeeBasisPoints: 0,
                    creators: null,
                    collection: null,
                    uses: null
                },
                isMutable: true,
                collectionDetails: null
            }
        }
    );

    const transaction = new Transaction().add(instruction);
    const latestBlockhash = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = payer.publicKey;

    try {
        const signature = await sendAndConfirmTransaction(connection, transaction, [payer], {
            commitment: 'finalized',
            maxRetries: 5
        });

        // Wait for metadata to be available
        let retries = 5;
        while (retries > 0) {
            try {
                const metadataAccount = await connection.getAccountInfo(metadataAddress);
                if (metadataAccount) {
                    console.log('Metadata account verified:', metadataAddress.toBase58());
                    break;
                }
            } catch (e) {
                console.log('Waiting for metadata account...');
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
            retries--;
        }
        if (retries === 0) {
            throw new Error('Failed to verify metadata account creation');
        }

    } catch (error) {
        throw new Error('Metadata creation failed: ' + error);
    }
}

async function createToken() {
    // Load private key from environment variable and parse array format
    const privateKeyString = process.env.WALLET_PRIVATE_KEY;
    if (!privateKeyString) {
        throw new Error('Private key not found in environment variables');
    }

    // Convert array string to Uint8Array
    let privateKeyBytes: Uint8Array;
    try {
        // Parse the array string and convert to Uint8Array
        const arrayValues = JSON.parse(privateKeyString);
        privateKeyBytes = new Uint8Array(arrayValues);
    } catch (error) {
        throw new Error('Failed to parse private key array: ' + error);
    }

    // Create keypair from bytes
    const payer = Keypair.fromSecretKey(privateKeyBytes);

    // Connect to Solana mainnet via Helius
    const connection = new Connection(
        `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
        {
            commitment: 'finalized',
            confirmTransactionInitialTimeout: 60000,
            wsEndpoint: `wss://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
        }
    );
    try {
        await connection.getLatestBlockhash();
    } catch (error) {
        throw new Error('Failed to connect to Solana mainnet: ' + error);
    }

    console.log('Using wallet:', payer.publicKey.toBase58());

    console.log('\nToken Configuration:');
    console.log(`Name: ${TOKEN_CONFIG.name}`);
    console.log(`Symbol: ${TOKEN_CONFIG.symbol}`);
    console.log(`Decimals: ${TOKEN_CONFIG.decimals}`);
    console.log(`Total Supply: ${TOKEN_CONFIG.totalSupply}`);
    console.log(`Description: ${TOKEN_CONFIG.description}`);

    // Check initial balance
    console.log('Checking wallet balance...');
    const initialBalance = await connection.getBalance(payer.publicKey);
    console.log(`Wallet balance: ${initialBalance/LAMPORTS_PER_SOL} SOL`);
    
    // We need approximately:
    // - 0.00147 SOL for mint creation
    // - 0.01512 SOL for metadata
    // - 0.00145 SOL for token account
    // - 0.00001 SOL for minting
    // - 0.00001 SOL for authority removal
    // Total: ~0.018 SOL to be safe
    const MINIMUM_BALANCE = 18000000; // 0.018 SOL
    
    if (initialBalance < MINIMUM_BALANCE) {
        throw new Error(`Insufficient balance. Has ${initialBalance/LAMPORTS_PER_SOL} SOL, needs at least ${MINIMUM_BALANCE/LAMPORTS_PER_SOL} SOL`);
    }

    // Create new token mint
    console.log('Creating token mint...');
    let mint;
    try {
        const latestBlockhash = await connection.getLatestBlockhash('finalized');
        const mintTransaction = await createMint(
            connection,
            payer,
            payer.publicKey,    // mint authority
            null,               // freeze authority set to null - can never be frozen
            TOKEN_CONFIG.decimals
        );
        
        // The createMint function returns a PublicKey, not a transaction signature
        mint = mintTransaction;
        
        // Get the transaction signature from recent signatures for the address
        const signatures = await connection.getSignaturesForAddress(mint, { limit: 1 });
        if (signatures.length === 0) {
            throw new Error('No signature found for mint creation');
        }
        
        const confirmation = await connection.confirmTransaction({
            signature: signatures[0].signature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
        }, 'finalized');

        if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${confirmation.value.err}`);
        }

        console.log('Token mint created:', mint.toBase58());
    } catch (error) {
        throw new Error('Failed to create token mint: ' + error);
    }

    // Create metadata
    console.log('Creating token metadata...');
    await createTokenMetadata(connection, payer, mint);

    // Create associated token account
    console.log('Creating token account...');
    let tokenAccount;
    try {
        const latestBlockhash = await connection.getLatestBlockhash('finalized');
        tokenAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            payer,
            mint,
            payer.publicKey,
            undefined,
            'finalized'  // Add commitment level
        );

        // Instead of looking for signatures, we'll verify the account exists
        const accountInfo = await connection.getAccountInfo(tokenAccount.address);
        if (!accountInfo) {
            throw new Error('Token account not found after creation');
        }

        console.log('Token account:', tokenAccount.address.toBase58());
    } catch (error) {
        throw new Error('Failed to create token account: ' + error);
    }

    // Mint initial supply
    console.log('Minting tokens...');
    try {
        const latestBlockhash = await connection.getLatestBlockhash('finalized');
        const signature = await mintTo(
            connection,
            payer,
            mint,
            tokenAccount.address,
            payer,
            TOKEN_CONFIG.totalSupply
        );
        const confirmation = await connection.confirmTransaction({
            signature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
        }, 'finalized');

        if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${confirmation.value.err}`);
        }
    } catch (error) {
        throw new Error('Failed to mint initial supply: ' + error);
    }

    // Remove mint authority only (no freeze authority to remove)
    console.log('Removing mint authority...');
    let retries = 3;
    while (retries > 0) {
        try {
            const transaction = new Transaction().add(
                createSetAuthorityInstruction(
                    mint,
                    payer.publicKey,
                    AuthorityType.MintTokens,
                    null
                )
            );

            const latestBlockhash = await connection.getLatestBlockhash('finalized');
            transaction.recentBlockhash = latestBlockhash.blockhash;
            transaction.feePayer = payer.publicKey;
            
            const signature = await sendAndConfirmTransaction(connection, transaction, [payer], {
                commitment: 'finalized',
                maxRetries: 5
            });
            
            await connection.confirmTransaction({
                signature,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            }, 'finalized');
            
            console.log('Mint authority removed successfully');
            break;
        } catch (error) {
            console.log(`Authority removal attempt ${3-retries+1} failed, retrying...`);
            retries--;
            if (retries === 0) {
                throw new Error('Failed to remove mint authority after all retries: ' + error);
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    console.log('Tokens minted successfully');
    console.log('Mint public key:', mint.toBase58());
    console.log('Token Account:', tokenAccount.address.toBase58());
}

createToken().catch(console.error); 