export const accountDeletionKeyword = "削除";

export function confirmAccountDeletion({ confirmFn = globalThis.confirm, promptFn = globalThis.prompt } = {}) {
  const acceptedWarning = confirmFn("アカウントとすべての面接データを完全に削除します。この操作は取り消せません。削除手続きを続けますか？");
  if (!acceptedWarning) return false;
  const typed = promptFn(`最終確認です。削除するには「${accountDeletionKeyword}」と入力してください。`);
  return typed === accountDeletionKeyword;
}
