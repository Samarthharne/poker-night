export function Pot({ amount }: { amount: number }) {
  return (
    <div className="rounded-full border border-gold/30 bg-black/35 px-4 py-1.5 text-sm text-gold-bright">
      POT: {amount.toLocaleString()} 🪙
    </div>
  );
}
