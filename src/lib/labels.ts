import type { AccountType, EntryKind, EntryStatus, EvidenceStatus, HealthStatus, ProgramStatus, Role } from "./types";

export const KIND_LABEL: Record<EntryKind, string> = {
  pemasukan: "Pemasukan",
  pengeluaran: "Pengeluaran",
  transfer: "Transfer",
  saldo_awal: "Saldo awal",
  penyesuaian: "Penyesuaian",
  pembalikan: "Pembalikan",
};

export const STATUS_LABEL: Record<EntryStatus, string> = {
  draft: "Draft",
  dibukukan: "Dibukukan",
  dibalik: "Dibalik",
};

export const EVIDENCE_LABEL: Record<EvidenceStatus, string> = {
  lengkap: "Lengkap",
  belum_ada: "Belum Ada",
  tidak_tersedia: "Tidak Tersedia",
};

export const PROGRAM_STATUS_LABEL: Record<ProgramStatus, string> = {
  perencanaan: "Perencanaan",
  berjalan: "Berjalan",
  selesai: "Selesai",
  diarsipkan: "Diarsipkan",
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin Organisasi",
  bendahara: "Bendahara",
  pembaca: "Pembaca",
};

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  aset: "Aset",
  kewajiban: "Kewajiban",
  saldo_dana: "Saldo dana",
  pendapatan: "Pendapatan",
  beban: "Beban",
};

export const CASH_KIND_LABEL = {
  tunai: "Kas tunai",
  bank: "Rekening bank",
  dompet_digital: "Dompet digital",
} as const;

export const HEALTH_LABEL: Record<HealthStatus, string> = {
  aman: "Aman",
  perlu_perhatian: "Perlu Perhatian",
  kritis: "Kritis",
  data_belum_cukup: "Data Belum Cukup",
};

export const SEVERITY_LABEL = {
  info: "Informasi",
  perlu_perhatian: "Perlu perhatian",
  kritis: "Kritis",
} as const;

export const NAV = [
  { href: "/ringkasan", label: "Ringkasan", icon: "LayoutDashboard" },
  { href: "/kas", label: "Kas Umum", icon: "Wallet" },
  { href: "/program", label: "Program", icon: "FolderKanban" },
  { href: "/jurnal", label: "Jurnal & Buku Besar", icon: "BookOpenText" },
  { href: "/laporan", label: "Laporan", icon: "FileBarChart" },
  { href: "/arsip", label: "Arsip Bukti", icon: "Archive" },
  { href: "/pengaturan", label: "Pengaturan", icon: "Settings" },
] as const;
