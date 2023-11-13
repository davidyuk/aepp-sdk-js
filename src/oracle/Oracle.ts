import { pause } from '../utils/other';
import { buildTxAsync, BuildTxOptions } from '../tx/builder';
import { Tag } from '../tx/builder/constants';
import { LogicError, UnexpectedTsError } from '../utils/errors';
import {
  decode, encode, Encoded, Encoding,
} from '../utils/encoder';
import { _getPollInterval } from '../chain';
import { sendTransaction, SendTransactionOptions } from '../send-transaction';
import Node from '../Node';
import AccountBase from '../account/Base';
import OracleBase, { OracleQuery, decodeQuery } from './OracleBase';

interface OracleRegisterOptions extends
  BuildTxOptions<Tag.OracleRegisterTx, 'accountId' | 'queryFormat' | 'responseFormat'>,
  Omit<SendTransactionOptions, 'onNode' | 'onAccount'> {}

interface OracleExtendTtlOptions extends
  BuildTxOptions<Tag.OracleExtendTx, 'callerId' | 'oracleId'>,
  Omit<SendTransactionOptions, 'onNode' | 'onAccount'> {}

interface OracleRespondToQueryOptions extends
  BuildTxOptions<Tag.OracleResponseTx, 'callerId' | 'oracleId' | 'queryId' | 'response'>,
  Omit<SendTransactionOptions, 'onNode' | 'onAccount'> {}

/**
 * @category oracle
 */
export default class Oracle extends OracleBase {
  /**
   * @param account - Account to use as oracle
   * @param options - Options object
   */
  constructor(
    public readonly account: AccountBase,
    public override options: OracleRegisterOptions & OracleExtendTtlOptions &
    Parameters<Oracle['handleQueries']>[1] & { onNode: Node },
  ) {
    super(encode(decode(account.address), Encoding.OracleAddress), options);
  }

  // TODO: support abiVersion other than 0
  /**
   * Register oracle
   * @param queryFormat - Format of query
   * @param responseFormat - Format of query response
   * @param options - Options object
   */
  async register(
    queryFormat: string,
    responseFormat: string,
    options: OracleRegisterOptions = {},
  ): ReturnType<typeof sendTransaction> {
    const opt = { ...this.options, ...options };
    const oracleRegisterTx = await buildTxAsync({
      _isInternalBuild: true,
      ...opt,
      tag: Tag.OracleRegisterTx,
      accountId: this.account.address,
      queryFormat,
      responseFormat,
    });
    return sendTransaction(oracleRegisterTx, { ...opt, onAccount: this.account });
  }

  /**
   * Extend oracle ttl
   * @param options - Options object
   */
  async extendTtl(options: OracleExtendTtlOptions = {}): ReturnType<typeof sendTransaction> {
    const opt = { ...this.options, ...options };
    const oracleExtendTx = await buildTxAsync({
      _isInternalBuild: true,
      ...opt,
      tag: Tag.OracleExtendTx,
      oracleId: this.address,
    });
    return sendTransaction(oracleExtendTx, { ...opt, onAccount: this.account });
  }

  /**
   * Poll for oracle queries
   * @param onQuery - OnQuery callback
   * @param options - Options object
   * @param options.interval - Poll interval (default: 5000)
   * @returns Callback to stop polling function
   */
  pollQueries(
    onQuery: (query: OracleQuery) => void,
    options: { interval?: number; includeResponded?: boolean } &
    Partial<Parameters<typeof _getPollInterval>[1]> = {},
  ): () => void {
    const opt = { ...this.options, ...options };
    const knownQueryIds = new Set();
    const checkNewQueries = async (): Promise<void> => {
      const queries = (await opt.onNode.getOracleQueriesByPubkey(this.address)).oracleQueries ?? [];
      queries
        .filter(({ id }) => !knownQueryIds.has(id))
        .map((query) => decodeQuery(query))
        .filter((query) => options.includeResponded === true || query.decodedResponse === '')
        .forEach((query) => {
          knownQueryIds.add(query.id);
          onQuery(query);
        });
    };

    let stopped = false;

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      const interval = opt.interval ?? await _getPollInterval('micro-block', opt);
      while (!stopped) { // eslint-disable-line no-unmodified-loop-condition
        // TODO: allow to handle this error somehow
        await checkNewQueries().catch(console.error);
        await pause(interval);
      }
    })();
    return () => { stopped = true; };
  }

  /**
   * Respond to a query
   * @param queryId - Oracle query id
   * @param response - The response to query
   * @param options - Options object
   */
  async respondToQuery(
    queryId: Encoded.OracleQueryId,
    response: string,
    options: OracleRespondToQueryOptions = {},
  ): ReturnType<typeof sendTransaction> {
    const opt = { ...this.options, ...options };
    const oracleRespondTx = await buildTxAsync({
      _isInternalBuild: true,
      ...opt,
      tag: Tag.OracleResponseTx,
      oracleId: this.address,
      queryId,
      response,
    });
    return sendTransaction(oracleRespondTx, { ...opt, onAccount: this.account });
  }

  #handleQueriesPromise?: Promise<void>;

  /**
   * Respond to queries to oracle based on callback value
   * @param getResponse - Callback to respond on query
   * @param options - Options object
   * @param options.interval - Poll interval (default: 5000)
   * @returns Callback to stop polling function
   */
  handleQueries(
    getResponse: (q: OracleQuery) => Promise<string> | string,
    options: Parameters<Oracle['pollQueries']>[1] & OracleRespondToQueryOptions = {},
  ): () => void {
    if (this.#handleQueriesPromise != null) {
      throw new LogicError('Another query handler already running, it needs to be stopped to run a new one');
    }
    const opt = { ...this.options, ...options };

    let queuePromise = Promise.resolve();
    const handler = async (q: OracleQuery): Promise<void> => {
      const response = await getResponse(q);
      const respondPromise = queuePromise
        .then(async () => this.respondToQuery(q.id, response, opt));
      queuePromise = respondPromise.then(() => {}, () => {});
      await respondPromise;
    };

    this.#handleQueriesPromise = Promise.resolve();
    const stopPoll = this.pollQueries(
      async (query: OracleQuery) => {
        const promise = handler(query);
        if (this.#handleQueriesPromise == null) throw new UnexpectedTsError();
        this.#handleQueriesPromise = this.#handleQueriesPromise
          .then(async () => promise).then(() => {}, () => {});
        return promise;
      },
      opt,
    );

    return async () => {
      stopPoll();
      await this.#handleQueriesPromise;
      this.#handleQueriesPromise = undefined;
    };
  }
}
