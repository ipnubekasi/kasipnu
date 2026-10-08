import * as React from "react";
import type { IconType } from "react-icons";
import {
  IoAddOutline, IoArchiveOutline, IoArrowBackOutline, IoArrowDownOutline, IoArrowForwardOutline, IoArrowUndoOutline, IoArrowUpOutline,
  IoAttachOutline, IoBanOutline, IoBarChartOutline, IoBookOutline, IoBusinessOutline, IoCameraOutline, IoCheckmarkCircleOutline,
  IoCheckmarkDoneOutline, IoChevronBackOutline, IoChevronDownOutline, IoChevronForwardOutline, IoCloseCircleOutline, IoCloseOutline,
  IoCloudUploadOutline, IoCreateOutline, IoDocumentTextOutline, IoDownloadOutline, IoEllipseOutline, IoEllipsisHorizontal, IoEyeOffOutline,
  IoEyeOutline, IoFlagOutline, IoFlaskOutline, IoFolderOpenOutline, IoGridOutline, IoHelpCircleOutline, IoImageOutline,
  IoInformationCircleOutline, IoListOutline, IoLockClosedOutline, IoLogOutOutline, IoMenuOutline, IoNotificationsOffOutline,
  IoNotificationsOutline, IoPersonAddOutline, IoPersonOutline, IoQrCodeOutline, IoReaderOutline, IoReceiptOutline, IoRefreshOutline,
  IoReloadOutline, IoRemoveCircleOutline, IoScaleOutline, IoSearchOutline, IoSettingsOutline, IoShieldCheckmarkOutline, IoShieldOutline,
  IoPulseOutline, IoSwapHorizontalOutline, IoSwapVerticalOutline, IoTimeOutline, IoTrashOutline, IoWalletOutline, IoWarningOutline,
} from "react-icons/io5";

/**
 * Lapisan ikon tunggal aplikasi (Ionicons). Seluruh komponen mengimpor dari sini,
 * sehingga paket ikon dapat diganti di satu tempat. Nama ikon dipertahankan agar
 * pemakaian lama tetap sama.
 */
export type IconProps = Omit<React.SVGAttributes<SVGElement>, "ref"> & { size?: number | string; strokeWidth?: number | string };
export type AppIcon = React.ComponentType<IconProps>;

function make(Base: IconType, rotate = 0, label?: string): AppIcon {
  const Icon = ({ size = 24, strokeWidth: _sw, style, ...rest }: IconProps) => {
    void _sw;
    return <Base size={size} style={rotate ? { transform: `rotate(${rotate}deg)`, ...style } : style} {...rest} />;
  };
  Icon.displayName = label ?? Base.name;
  return Icon;
}

export const AlertTriangle = make(IoWarningOutline, 0, "AlertTriangle");
export const TriangleAlert = AlertTriangle;
export const Archive = make(IoArchiveOutline, 0, "Archive");
export const ArrowDown = make(IoArrowDownOutline, 0, "ArrowDown");
export const ArrowDownLeft = make(IoArrowForwardOutline, 135, "ArrowDownLeft");
export const ArrowLeftRight = make(IoSwapHorizontalOutline, 0, "ArrowLeftRight");
export const ArrowRight = make(IoArrowForwardOutline, 0, "ArrowRight");
export const ArrowUp = make(IoArrowUpOutline, 0, "ArrowUp");
export const ArrowUpDown = make(IoSwapVerticalOutline, 0, "ArrowUpDown");
export const ArrowUpRight = make(IoArrowForwardOutline, -45, "ArrowUpRight");
export const Ban = make(IoBanOutline, 0, "Ban");
export const Bell = make(IoNotificationsOutline, 0, "Bell");
export const BellOff = make(IoNotificationsOffOutline, 0, "BellOff");
export const BookOpenText = make(IoBookOutline, 0, "BookOpenText");
export const Camera = make(IoCameraOutline, 0, "Camera");
export const CheckCheck = make(IoCheckmarkDoneOutline, 0, "CheckCheck");
export const CheckCircle2 = make(IoCheckmarkCircleOutline, 0, "CheckCircle2");
export const CircleCheck = CheckCircle2;
export const ChevronDown = make(IoChevronDownOutline, 0, "ChevronDown");
export const ChevronLeft = make(IoChevronBackOutline, 0, "ChevronLeft");
export const ChevronRight = make(IoChevronForwardOutline, 0, "ChevronRight");
export const CircleDashed = make(IoEllipseOutline, 0, "CircleDashed");
export const CircleHelp = make(IoHelpCircleOutline, 0, "CircleHelp");
export const CircleSlash = make(IoRemoveCircleOutline, 0, "CircleSlash");
export const Download = make(IoDownloadOutline, 0, "Download");
export const Eye = make(IoEyeOutline, 0, "Eye");
export const EyeOff = make(IoEyeOffOutline, 0, "EyeOff");
export const FileBarChart = make(IoBarChartOutline, 0, "FileBarChart");
export const FileCheck2 = make(IoCheckmarkCircleOutline, 0, "FileCheck2");
export const FileDown = make(IoDownloadOutline, 0, "FileDown");
export const FileImage = make(IoImageOutline, 0, "FileImage");
export const FileQuestion = make(IoHelpCircleOutline, 0, "FileQuestion");
export const FileSpreadsheet = make(IoReaderOutline, 0, "FileSpreadsheet");
export const FileText = make(IoDocumentTextOutline, 0, "FileText");
export const FileUp = make(IoCloudUploadOutline, 0, "FileUp");
export const FileX2 = make(IoCloseCircleOutline, 0, "FileX2");
export const Flag = make(IoFlagOutline, 0, "Flag");
export const FlaskConical = make(IoFlaskOutline, 0, "FlaskConical");
export const FolderKanban = make(IoFolderOpenOutline, 0, "FolderKanban");
export const HeartPulse = make(IoPulseOutline, 0, "HeartPulse");
export const History = make(IoTimeOutline, 0, "History");
export const Info = make(IoInformationCircleOutline, 0, "Info");
export const Landmark = make(IoBusinessOutline, 0, "Landmark");
export const LayoutDashboard = make(IoGridOutline, 0, "LayoutDashboard");
export const Lock = make(IoLockClosedOutline, 0, "Lock");
export const LogOut = make(IoLogOutOutline, 0, "LogOut");
export const Menu = make(IoMenuOutline, 0, "Menu");
export const MoreHorizontal = make(IoEllipsisHorizontal, 0, "MoreHorizontal");
export const Paperclip = make(IoAttachOutline, 0, "Paperclip");
export const Pencil = make(IoCreateOutline, 0, "Pencil");
export const PencilLine = Pencil;
export const Plus = make(IoAddOutline, 0, "Plus");
export const QrCode = make(IoQrCodeOutline, 0, "QrCode");
export const ReceiptText = make(IoReceiptOutline, 0, "ReceiptText");
export const RefreshCw = make(IoRefreshOutline, 0, "RefreshCw");
export const RotateCcw = make(IoReloadOutline, 0, "RotateCcw");
export const Scale = make(IoScaleOutline, 0, "Scale");
export const Search = make(IoSearchOutline, 0, "Search");
export const SearchX = Search;
export const Settings = make(IoSettingsOutline, 0, "Settings");
export const ShieldAlert = make(IoShieldOutline, 0, "ShieldAlert");
export const ShieldCheck = make(IoShieldCheckmarkOutline, 0, "ShieldCheck");
export const ShieldOff = make(IoShieldOutline, 0, "ShieldOff");
export const ShieldQuestion = make(IoShieldOutline, 0, "ShieldQuestion");
export const Table2 = make(IoListOutline, 0, "Table2");
export const Trash2 = make(IoTrashOutline, 0, "Trash2");
export const Undo2 = make(IoArrowUndoOutline, 0, "Undo2");
export const Upload = make(IoCloudUploadOutline, 0, "Upload");
export const UploadCloud = Upload;
export const UserPlus = make(IoPersonAddOutline, 0, "UserPlus");
export const UserRound = make(IoPersonOutline, 0, "UserRound");
export const Wallet = make(IoWalletOutline, 0, "Wallet");
export const X = make(IoCloseOutline, 0, "X");
export const XCircle = make(IoCloseCircleOutline, 0, "XCircle");
export const ArrowLeft = make(IoArrowBackOutline, 0, "ArrowLeft");
