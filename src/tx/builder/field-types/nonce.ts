import { isAccountNotFoundError } from '../../../utils/other';
import shortUInt from './short-u-int';
import Node from '../../../Node';
import { ArgumentError } from '../../../utils/errors';

export default function genNonceField<SenderKey extends string>(senderKey: SenderKey): {
  serialize: (value: number) => Buffer;
  // TODO: (value: number) => Promise<number> | (value: undefined, ...) => Promise<number>
  prepare: (
    value: number | undefined,
    params: {},
    // TODO: replace `string` with AddressEncodings
    options: { [key in SenderKey]?: string } & { strategy?: 'continuity' | 'max'; onNode?: Node },
  ) => Promise<number>;
  deserialize: (value: Buffer) => number;
} {
  return {
    ...shortUInt,

    async prepare(value, params, options) {
      if (value != null) return value;
      const { onNode, strategy } = options;
      const senderId = options[senderKey];
      const requirement = 'provided (or provide `nonce` instead)';
      if (onNode == null) throw new ArgumentError('onNode', requirement, onNode);
      if (senderId == null) throw new ArgumentError('senderId', requirement, senderId);
      return (
        await onNode.getAccountNextNonce(senderId, { strategy }).catch((error) => {
          if (!isAccountNotFoundError(error)) throw error;
          return { nextNonce: 1 };
        })
      ).nextNonce;
    },
  };
}
