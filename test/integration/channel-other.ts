import {
  describe, it, before, beforeEach, afterEach,
} from 'mocha';
import { expect } from 'chai';
import BigNumber from 'bignumber.js';
import { getSdk, networkId, timeoutBlock } from '.';
import {
  unpackTx, Encoded, Tag, AeSdk, Channel, MemoryAccount,
} from '../../src';
import { appendSignature } from '../../src/channel/handlers';
import { assertNotNull } from '../utils';
import {
  waitForChannel, sharedParams, initializeChannels, recreateAccounts,
} from './channel-utils';

describe('Channel other', () => {
  let aeSdk: AeSdk;
  let initiator: MemoryAccount;
  let responder: MemoryAccount;
  let initiatorCh: Channel;
  let responderCh: Channel;
  const initiatorSign = async (tx: Encoded.Transaction): Promise<Encoded.Transaction> => (
    initiator.signTransaction(tx, { networkId })
  );
  const responderSign = async (tx: Encoded.Transaction): Promise<Encoded.Transaction> => (
    responder.signTransaction(tx, { networkId })
  );
  const initiatorParams = {
    role: 'initiator',
    host: 'localhost',
    sign: async (_tag: string, tx: Encoded.Transaction) => initiatorSign(tx),
  } as const;
  const responderParams = {
    role: 'responder',
    sign: async (_tag: string, tx: Encoded.Transaction) => responderSign(tx),
  } as const;

  async function getBalances(): Promise<[string, string]> {
    const [bi, br] = await Promise.all(
      [initiator.address, responder.address].map(async (a) => aeSdk.getBalance(a)),
    );
    return [bi, br];
  }

  before(async () => {
    aeSdk = await getSdk(3);
    await Promise.all(
      aeSdk.addresses().slice(1)
        .map(async (onAccount) => aeSdk.transferFunds(1, aeSdk.address, { onAccount })),
    );
  });

  beforeEach(async () => {
    [initiator, responder] = await recreateAccounts(aeSdk);
    [initiatorCh, responderCh] = await initializeChannels(initiatorParams, responderParams);
  });

  afterEach(() => {
    initiatorCh.disconnect();
    responderCh.disconnect();
  });

  it('can solo close a channel', async () => {
    const { signedTx } = await initiatorCh.update(
      initiator.address,
      responder.address,
      1e14,
      initiatorSign,
    );
    assertNotNull(signedTx);
    const poi = await initiatorCh.poi({
      accounts: [initiator.address, responder.address],
    });
    const balances = await initiatorCh.balances([initiator.address, responder.address]);
    const [initiatorBalanceBeforeClose, responderBalanceBeforeClose] = await getBalances();
    const closeSoloTx = await aeSdk.buildTx({
      tag: Tag.ChannelCloseSoloTx,
      channelId: initiatorCh.id(),
      fromId: initiator.address,
      poi,
      payload: signedTx,
    });
    const closeSoloTxFee = unpackTx(closeSoloTx, Tag.ChannelCloseSoloTx).fee;
    await aeSdk.sendTransaction(closeSoloTx, { onAccount: initiator });

    const settleTx = await aeSdk.buildTx({
      tag: Tag.ChannelSettleTx,
      channelId: initiatorCh.id(),
      fromId: initiator.address,
      initiatorAmountFinal: balances[initiator.address],
      responderAmountFinal: balances[responder.address],
    });
    const settleTxFee = unpackTx(settleTx, Tag.ChannelSettleTx).fee;
    await aeSdk.sendTransaction(settleTx, { onAccount: initiator });

    const [initiatorBalanceAfterClose, responderBalanceAfterClose] = await getBalances();
    new BigNumber(initiatorBalanceAfterClose)
      .minus(initiatorBalanceBeforeClose)
      .plus(closeSoloTxFee)
      .plus(settleTxFee)
      .isEqualTo(balances[initiator.address])
      .should.be.equal(true);
    new BigNumber(responderBalanceAfterClose)
      .minus(responderBalanceBeforeClose)
      .isEqualTo(balances[responder.address])
      .should.be.equal(true);
  }).timeout(timeoutBlock);

  it('can dispute via slash tx', async () => {
    const [initiatorBalanceBeforeClose, responderBalanceBeforeClose] = await getBalances();
    const oldUpdate = await initiatorCh
      .update(initiator.address, responder.address, 100, initiatorSign);
    const oldPoi = await initiatorCh.poi({
      accounts: [initiator.address, responder.address],
    });
    const recentUpdate = await initiatorCh
      .update(initiator.address, responder.address, 100, initiatorSign);
    const recentPoi = await responderCh.poi({
      accounts: [initiator.address, responder.address],
    });
    const recentBalances = await responderCh.balances([initiator.address, responder.address]);
    assertNotNull(oldUpdate.signedTx);
    const closeSoloTx = await aeSdk.buildTx({
      tag: Tag.ChannelCloseSoloTx,
      channelId: initiatorCh.id(),
      fromId: initiator.address,
      poi: oldPoi,
      payload: oldUpdate.signedTx,
    });
    const closeSoloTxFee = unpackTx(closeSoloTx, Tag.ChannelCloseSoloTx).fee;
    await aeSdk.sendTransaction(closeSoloTx, { onAccount: initiator });

    assertNotNull(recentUpdate.signedTx);
    const slashTx = await aeSdk.buildTx({
      tag: Tag.ChannelSlashTx,
      channelId: responderCh.id(),
      fromId: responder.address,
      poi: recentPoi,
      payload: recentUpdate.signedTx,
    });
    const slashTxFee = unpackTx(slashTx, Tag.ChannelSlashTx).fee;
    await aeSdk.sendTransaction(slashTx, { onAccount: responder });
    const settleTx = await aeSdk.buildTx({
      tag: Tag.ChannelSettleTx,
      channelId: responderCh.id(),
      fromId: responder.address,
      initiatorAmountFinal: recentBalances[initiator.address],
      responderAmountFinal: recentBalances[responder.address],
    });
    const settleTxFee = unpackTx(settleTx, Tag.ChannelSettleTx).fee;
    await aeSdk.sendTransaction(settleTx, { onAccount: responder });

    const [initiatorBalanceAfterClose, responderBalanceAfterClose] = await getBalances();
    new BigNumber(initiatorBalanceAfterClose)
      .minus(initiatorBalanceBeforeClose)
      .plus(closeSoloTxFee)
      .isEqualTo(recentBalances[initiator.address])
      .should.be.equal(true);
    new BigNumber(responderBalanceAfterClose)
      .minus(responderBalanceBeforeClose)
      .plus(slashTxFee)
      .plus(settleTxFee)
      .isEqualTo(recentBalances[responder.address])
      .should.be.equal(true);
  }).timeout(timeoutBlock);

  // https://github.com/aeternity/protocol/blob/d634e7a3f3110657900759b183d0734e61e5803a/node/api/channels_api_usage.md#reestablish
  it('can reconnect', async () => {
    expect(initiatorCh.round()).to.be.equal(1);
    const result = await initiatorCh.update(
      initiator.address,
      responder.address,
      100,
      initiatorSign,
    );
    expect(result.accepted).to.equal(true);
    const channelId = initiatorCh.id();
    const fsmId = initiatorCh.fsmId();
    initiatorCh.disconnect();
    await waitForChannel(initiatorCh, ['disconnected']);
    const ch = await Channel.initialize({
      ...sharedParams,
      ...initiatorParams,
      existingChannelId: channelId,
      existingFsmId: fsmId,
    });
    await waitForChannel(ch, ['open']);
    expect(ch.fsmId()).to.be.equal(fsmId);
    expect(ch.round()).to.be.equal(2);
    const state = await ch.state();
    ch.disconnect();
    assertNotNull(state.signedTx);
    expect(state.signedTx.encodedTx.tag).to.be.equal(Tag.ChannelOffChainTx);
  });

  it('can post backchannel update', async () => {
    expect(responderCh.round()).to.be.equal(1);
    initiatorCh.disconnect();
    const { accepted } = await responderCh.update(
      initiator.address,
      responder.address,
      100,
      responderSign,
    );
    expect(accepted).to.equal(false);
    expect(responderCh.round()).to.be.equal(1);
    const result = await responderCh.update(
      initiator.address,
      responder.address,
      100,
      async (transaction) => (
        appendSignature(await responderSign(transaction), initiatorSign)
      ),
    );
    result.accepted.should.equal(true);
    expect(responderCh.round()).to.be.equal(2);
    expect(result.signedTx).to.be.a('string');
  });
});
