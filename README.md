# ledger-scanner

Ledger Scanner is a privacy-focused tool designed for enumerating Ledger wallet addresses based on custom derivation path templates. This tool is ideal for users who need to scan and analyze Ethereum addresses derived from their Ledger hardware wallet locally.

## Features

* Customizable Derivation Paths: Define custom derivation path templates.
* Flexible Address Enumeration: Specify how many addresses to enumerate, from which index to start, and how many paths to cover.
* RPC Connectivity: Connects to a specified Ethereum RPC endpoint to retrieve balance information and a private way.
* ETH Balance Checking: Queries and reports the ETH balance for each derived address.
* CSV Export: Export the scanned data to a CSV file for easy analysis and record-keeping.

## Installation

### Locally

```sh
git clone https://github.com/lbeder/ledger-scanner

cd ledger-scanner

pnpm install

# Or
yarn

# Or
npm install
```

### Globally

```sh
npm install -g ledger-scanner
```

Or run with npx:

```sh
npx ledger-scanner
```

This will also allow you to run the `ledger-scanner` in the terminal.

## Usage

### General

```sh
ledger-scanner <command>

Commands:
  ledger-scanner scan            Scan all addresses
  ledger-scanner export-pubkeys  Export all public keys and chain codes
  ledger-scanner scan-pubkeys    Scan all addresses via the provided public keys and chain codes file

Options:
  --help          Show help                                                                                    [boolean]
  --version       Show version number                                                                          [boolean]
  --provider-url  Web3 provider's URL                                        [string] [default: "http://localhost:8545"]
```

#### Scanning All Addresses

```sh
ledger-scanner scan

Scan all addresses

Options:
      --help                  Show help                                                                        [boolean]
      --version               Show version number                                                              [boolean]
      --provider-url          Web3 provider's URL                            [string] [default: "http://localhost:8545"]
  -p, --path                  Derivation path template. The path template should specify the address index (the "N"
                              component) and the path index (the "M" component). For example m/44'/60'/M'/N for standard
                              paths                                                 [string] [default: "m/44'/60'/M'/N"]
      --address-count         Number of addresses to derive and check (the "N" component)        [number] [default: 500]
      --address-start         Starting address index                                               [number] [default: 0]
      --path-count            Number of paths to derive and check (the "M" component)              [number] [default: 1]
      --path-start            Starting path index                                                  [number] [default: 0]
  -h, --hide-empty-addresses  Hide empty addresses                                            [boolean] [default: false]
  -s, --skip-balance          Skip ETH balance check                                          [boolean] [default: false]
  -r, --csv                   The CSV reports output directory (optional)                                       [string]
```

#### Export All Public Keys and Chain Codes

```sh
ledger-scanner export-pubkeys

Export all public keys and chain codes

Options:
      --help          Show help                                                                                [boolean]
      --version       Show version number                                                                      [boolean]
      --provider-url  Web3 provider's URL                                    [string] [default: "http://localhost:8545"]
  -p, --path          Derivation path template. The path template should specify the address index (the "N" component)
                      and the path index (the "M" component). For example m/44'/60'/M'/N for standard paths
                                                                                    [string] [default: "m/44'/60'/M'/N"]
      --path-count    Number of paths to derive and check (the "M" component)                      [number] [default: 1]
      --path-start    Starting path index                                                          [number] [default: 0]
  -o, --output        The CSV output path (optional)                                                            [string]
```

#### Scan All Addresses via the Provided Public Keys and Chain Codes File

```sh
ledger-scanner scan-pubkeys

Scan all addresses via the provided public keys and chain codes file

Options:
      --help                  Show help                                                                        [boolean]
      --version               Show version number                                                              [boolean]
      --provider-url          Web3 provider's URL                            [string] [default: "http://localhost:8545"]
      --address-count         Number of addresses to derive and check (the "N" component)        [number] [default: 500]
      --address-start         Starting address index                                               [number] [default: 0]
  -h, --hide-empty-addresses  Hide empty addresses                                            [boolean] [default: false]
  -s, --skip-balance          Skip ETH balance check                                          [boolean] [default: false]
  -i, --input                 The CSV input path                                                     [string] [required]
  -r, --csv                   The CSV reports output directory (optional)                                       [string]
```
