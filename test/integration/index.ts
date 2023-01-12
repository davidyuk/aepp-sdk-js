/*
 * ISC License (ISC)
 * Copyright 2022 aeternity developers
 *
 *  Permission to use, copy, modify, and/or distribute this software for any
 *  purpose with or without fee is hereby granted, provided that the above
 *  copyright notice and this permission notice appear in all copies.
 *
 *  THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 *  REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 *  AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 *  INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 *  LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
 *  OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 *  PERFORMANCE OF THIS SOFTWARE.
 */

import {
  AeSdk, CompilerHttpNode, MemoryAccount, Node,
} from '../../src';
import '..';

export const url = process.env.TEST_URL ?? 'http://localhost:3013';
export const compilerUrl = process.env.COMPILER_URL ?? 'http://localhost:3080';
const secretKey = process.env.SECRET_KEY ?? '9ebd7beda0c79af72a42ece3821a56eff16359b6df376cf049aee995565f022f840c974b97164776454ba119d84edc4d6058a8dec92b6edc578ab2d30b4c4200';
export const networkId = process.env.TEST_NETWORK_ID ?? 'ae_devnet';
export const ignoreVersion = process.env.IGNORE_VERSION === 'true';
const genesisAccount = new MemoryAccount(secretKey);

export async function getSdk(accountCount = 1): Promise<AeSdk> {
  const accounts = new Array(accountCount).fill(null).map(() => MemoryAccount.generate());
  const sdk = new AeSdk({
    onCompiler: new CompilerHttpNode(compilerUrl, { ignoreVersion }),
    nodes: [{ name: 'test', instance: new Node(url, { ignoreVersion }) }],
    accounts,
    _expectedMineRate: 1000,
    _microBlockCycle: 300,
  });
  await sdk.awaitHeight(2);
  for (let i = 0; i < accounts.length; i += 1) {
    await sdk.spend(1e32, accounts[i].address, { onAccount: genesisAccount });
  }
  return sdk;
}
