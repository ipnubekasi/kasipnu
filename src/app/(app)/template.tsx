/** Template (bukan layout): dimuat ulang tiap berpindah halaman, sehingga isi halaman masuk dengan gerak halus. */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="rise">{children}</div>;
}
