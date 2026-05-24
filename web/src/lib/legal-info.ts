/** 商店合规页 · 运营方信息（构建时由 VITE_LEGAL_* 注入） */
export function getLegalInfo(): {
  operator: string | null;
  email: string | null;
  address: string | null;
} {
  const operator = import.meta.env.VITE_LEGAL_OPERATOR?.trim() || null;
  const email = import.meta.env.VITE_LEGAL_EMAIL?.trim() || null;
  const address = import.meta.env.VITE_LEGAL_ADDRESS?.trim() || null;
  return { operator, email, address };
}

export function hasLegalInfo(): boolean {
  const { operator, email } = getLegalInfo();
  return Boolean(operator || email);
}
