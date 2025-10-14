# ledger-scanner

Ledger Scanner is a privacy-focused tool designed for enumerating Ledger wallet addresses based on custom derivation path templates. This tool is ideal for users who need to scan and analyze Ethereum addresses derived from their Ledger hardware wallet locally.

## Features

* Customizable Derivation Paths: Define custom derivation path templates.
* Flexible Address Enumeration: Specify how many addresses to enumerate, from which index to start, and how many paths to cover.
* RPC Connectivity: Connects to a specified Ethereum RPC endpoint to retrieve balance information and a private way.
* ETH Balance Checking: Queries and reports the ETH balance for each derived address.
* CSV Export: Export the scanned data to a CSV file for easy analysis and record-keeping.

## Installation

### Prerequisites

#### Linux (Ubuntu/Debian/Mint)

Before installing on Linux systems, you need to install build dependencies:

```sh
sudo apt-get update
sudo apt-get install build-essential libudev-dev
```

#### Linux (CentOS/RHEL/Fedora)

```sh
# For CentOS/RHEL
sudo yum groupinstall "Development Tools"
sudo yum install libudev-devel

# For Fedora
sudo dnf groupinstall "Development Tools"
sudo dnf install libudev-devel
```

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

**Note for Linux users:** If you encounter native binding errors, try:

```sh
# Rebuild native modules
pnpm rebuild-native

# Or force reinstall
pnpm install --force

# Alternative with npm
npm install --force
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
  ledger-scanner scan              Scan all addresses
  ledger-scanner export-pubkeys    Export all public keys and chain codes
  ledger-scanner export-addresses  Export all addresses
  ledger-scanner scan-pubkeys      Scan all addresses via the provided public keys and chain codes file
  ledger-scanner scan-addresses    Scan all addresses from the provided addresses CSV file

Options:
  --help     Show help                                                                                         [boolean]
  --version  Show version number                                                                               [boolean]
  --rpc      Ethereum RPC URL                                                [string] [default: "http://localhost:8545"]
```

#### Scanning All Addresses

```sh
ledger-scanner scan

Scan all addresses

Options:
      --help                  Show help                                                                        [boolean]
      --version               Show version number                                                              [boolean]
      --rpc                   Ethereum RPC URL                               [string] [default: "http://localhost:8545"]
  -p, --path                  Derivation path template. The path template should specify the address index (the "N"
                              component) and the path index (the "M" component). For example m/44'/60'/M'/N for standard
                              paths                                                 [string] [default: "m/44'/60'/M'/N"]
      --o-count         Number of addresses to derive and check (the "N" component)        [number] [default: 500]
      --o-start         Starting address index                                               [number] [default: 0]
      --m-count            Number of paths to derive and check (the "M" component)              [number] [default: 1]
      --m-start            Starting path index                                                  [number] [default: 0]
  -h, --hide-small-addresses  Hide addresses with balance less than or equal to the specified amount (in ETH). If no
                              amount is specified, hides empty addresses. Using -h without parameters is equivalent to
                              -h true.                                                       [string] [default: "false"]
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
      --rpc                   Ethereum RPC URL                               [string] [default: "http://localhost:8545"]
  -p, --path          Derivation path template. The path template should specify the address index (the "N" component)
                      and the path index (the "M" component). For example m/44'/60'/M'/N for standard paths
                                                                                    [string] [default: "m/44'/60'/M'/N"]
      --m-count    Number of paths to derive and check (the "M" component)                      [number] [default: 1]
      --m-start    Starting path index                                                          [number] [default: 0]
  -o, --output        The CSV output path (optional)                                                            [string]
```

#### Scan All Addresses via the Provided Public Keys and Chain Codes File

```sh
ledger-scanner scan-pubkeys

Scan all addresses via the provided public keys and chain codes file

Options:
      --help                  Show help                                                                        [boolean]
      --version               Show version number                                                              [boolean]
      --rpc                   Ethereum RPC URL                               [string] [default: "http://localhost:8545"]
      --o-count         Number of addresses to derive and check (the "N" component)        [number] [default: 500]
      --o-start         Starting address index                                               [number] [default: 0]
  -h, --hide-empty-addresses  Hide empty addresses                                            [boolean] [default: false]
  -s, --skip-balance          Skip ETH balance check                                          [boolean] [default: false]
  -i, --input                 The CSV input path                                                     [string] [required]
  -r, --csv                   The CSV reports output directory (optional)                                       [string]
```

#### Export All Addresses

```sh
ledger-scanner export-addresses

Export all addresses

Options:
      --help           Show help                                                                               [boolean]
      --version        Show version number                                                                     [boolean]
      --rpc            Ethereum RPC URL                                      [string] [default: "http://localhost:8545"]
  -p, --path           Derivation path template. The path template should specify the address index (the "N" component)
                       and the path index (the "M" component). For example m/44'/60'/M'/N for standard paths
                                                                                    [string] [default: "m/44'/60'/M'/N"]
      --o-count  Number of addresses to derive and check (the "N" component)               [number] [default: 500]
      --o-start  Starting address index                                                      [number] [default: 0]
      --m-count     Number of paths to derive and check (the "M" component)                     [number] [default: 1]
      --m-start     Starting path index                                                         [number] [default: 0]
  -o, --output         The CSV output path (optional)                                                           [string]
```

#### Scan All Addresses via the Addresses File

```sh
ledger-scanner scan-addresses

Scan all addresses from the provided addresses CSV file

Options:
      --help                  Show help                                                                        [boolean]
      --version               Show version number                                                              [boolean]
      --rpc                   Ethereum RPC URL                               [string] [default: "http://localhost:8545"]
  -h, --hide-small-addresses  Hide empty addresses                                            [boolean] [default: false]
  -s, --skip-balance          Skip ETH balance check                                          [boolean] [default: false]
  -i, --input                 The CSV input path                                                     [string] [required]
  -r, --csv                   The CSV reports output directory (optional)                                       [string]
```
