# Solana Token Creator

This project creates a custom SPL token on Solana mainnet with metadata and image support. The token will be non-freezable, non-blacklistable, and have a fixed supply after creation.

## Features

- Creates SPL Token on Solana mainnet
- Adds metadata with custom image
- Non-freezable (no freeze authority)
- Fixed supply (mint authority removed after creation)
- Permanent metadata storage on Arweave
- Uses Helius RPC for reliable connections

## Prerequisites

- Docker and Docker Compose
- Node.js 18.x or higher
- An ArDrive account
- A Solana wallet with sufficient SOL (~0.018 SOL minimum)
- Helius API key

## Project Structure

```
solana-token-project/
├── docker-compose.yml
├── Dockerfile
├── scripts/
│   ├── create-token.ts
│   └── setup.sh
├── .env
├── .env-sample
├── .gitignore
├── package.json
└── tsconfig.json
```

## Setup Instructions

### 1. Clone and Configure

1. Clone the repository
2. Copy `.env-sample` to `.env`
3. Install dependencies:
```bash
npm install
```

### 2. Prepare Token Image

1. Image Requirements:
   - Size: 512x512 pixels (recommended)
   - Format: PNG preferred
   - Max file size: 200KB
   - Aspect ratio: 1:1 (square)
   - Resolution: 72 DPI minimum
   - Color mode: RGB
   - Protip: you can use an online tool to resize and compress your image: https://www.iloveimg.com/compress-image/compress-png

### 3. Upload to ArDrive

1. Go to https://app.ardrive.io
2. Create an account if needed
3. Click "Upload" or "+" button
4. Select "Public Drive" (important!)
5. Upload your token image
6. After upload completes:
   - Click on the file
   - Find the "Data TX" or "Transaction ID"
   - Save this ID - you'll need it for metadata
   - Full URL will be: `https://arweave.net/YOUR_IMAGE_TX_ID`

### 4. Create Metadata JSON

1. Create a file named `token-metadata.json`
2. Use this template:
```json
{
    "name": "Your Token Name",
    "symbol": "TKN",
    "description": "Your token description",
    "image": "https://arweave.net/YOUR_IMAGE_TX_ID",
    "external_url": "https://your-website.com",
    "attributes": [
        {
            "trait_type": "Category",
            "value": "Your Category"
        }
    ],
    "properties": {
        "files": [
            {
                "uri": "https://arweave.net/YOUR_IMAGE_TX_ID",
                "type": "image/png",
                "cdn": false
            }
        ],
        "category": "image",
        "creators": []
    }
}
```

### 5. Upload Metadata to ArDrive

1. Return to app.ardrive.io
2. Upload your metadata JSON file
3. Get the transaction ID
4. This will be your TOKEN_URI: `https://arweave.net/YOUR_METADATA_TX_ID`

### 6. Configure Environment

Create a `.env` file with:

```
SOLANA_NETWORK=mainnet-beta
WALLET_PRIVATE_KEY=[your,wallet,private,key,array]

# Token Configuration
TOKEN_NAME="Your Token"
TOKEN_SYMBOL="TKN"
TOKEN_DESCRIPTION="Your description"
TOKEN_DECIMALS=9
TOKEN_SUPPLY=1000000000
TOKEN_URI="https://arweave.net/YOUR_METADATA_TX_ID"

# Helius Configuration
HELIUS_API_KEY=your_helius_api_key
```

### 7. Create Token

1. Ensure wallet has sufficient SOL (~0.018 SOL):
   - 0.00147 SOL for mint creation
   - 0.01512 SOL for metadata
   - 0.00145 SOL for token account
   - 0.00001 SOL for minting
   - 0.00001 SOL for authority removal

2. Run the creation script:
```bash
docker compose up --build
```

3. Save these addresses from the output:
   - Mint address (your token's address)
   - Token account address

## Security Considerations

1. Private Key Security:
   - Never share your private key
   - Use a dedicated wallet for token creation
   - Don't commit .env file to version control

2. Permanent Settings:
   - Token supply will be fixed (cannot mint more)
   - Token cannot be frozen (no freeze authority)
   - Metadata on Arweave is permanent

3. API Security:
   - Keep your Helius API key private
   - Don't expose RPC endpoints

## Troubleshooting

### Common Issues

1. Insufficient Balance:
   - Error: "insufficient lamports"
   - Solution: Add more SOL to wallet

2. Transaction Timeout:
   - Error: "Transaction expired"
   - Solution: Try again, network might be congested

3. RPC Issues:
   - Error: "Failed to connect to Solana"
   - Solution: Check Helius API key and network status

### Verification

After creation, verify your token:
1. Check Solana Explorer
2. Verify metadata is visible
3. Confirm no freeze authority
4. Confirm fixed supply

## Support

For issues:
1. Check wallet balance
2. Verify all environment variables
3. Ensure Arweave links are accessible
4. Check Helius API key validity

## License

MIT License

## Disclaimer

This tool creates permanent tokens on Solana mainnet. Test thoroughly and use at your own risk.
