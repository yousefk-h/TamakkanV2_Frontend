"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Dialog, DialogCloseButton } from "@/components/ui/Dialog";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo, Wordmark } from "@/components/ui/Logo";
import { type MessageKey, useI18n } from "@/lib/i18n/LocaleProvider";

type NavItem = { key: string; href: string; icon: IconName };

const STUDENT_NAV: NavItem[] = [
  { key: "home", href: "/student", icon: "home" },
  { key: "challenge", href: "/student/challenge", icon: "challenge" },
  { key: "lessons", href: "/student/lessons", icon: "lessons" },
  { key: "homework", href: "/student/homework", icon: "report" },
  { key: "submissions", href: "/student/submissions", icon: "video" },
  { key: "classes", href: "/student/classes", icon: "classes" },
  { key: "progress", href: "/student/progress", icon: "progress" },
];

const ADMIN_NAV: NavItem[] = [
  { key: "home", href: "/admin", icon: "home" },
  { key: "people", href: "/admin/students", icon: "people" },
  { key: "users", href: "/admin/users", icon: "userAccount" },
  { key: "levels", href: "/admin/levels", icon: "program" },
  { key: "report", href: "/admin/reports", icon: "report" },
  { key: "submissions", href: "/admin/submissions", icon: "video" },
  { key: "exerciseReview", href: "/admin/exercise-review", icon: "report" },
  { key: "homework", href: "/admin/homework", icon: "report" },
  { key: "program", href: "/admin/topics", icon: "program" },
  { key: "calendars", href: "/admin/calendars", icon: "calendar" },
  { key: "classes", href: "/admin/classes", icon: "classes" },
  { key: "progress", href: "/admin/analytics", icon: "progress" },
  { key: "operations", href: "/admin/operations", icon: "settings" },
];

function isActive(pathname: string, href: string) {
  return href === "/student" || href === "/admin" ? pathname === href : pathname.startsWith(href);
}

export function Sidebar({ variant, canSwitchView, onLogout, unreviewedCount = 0, showUsersNav = true, showOperationsNav = false }: {
  variant: "student" | "admin"; canSwitchView: boolean; onLogout: () => void; unreviewedCount?: number;
  /** The Center Admin Users page (Students + Teachers across the whole center) is Administrator-only - a
   * Teacher doesn't get this nav entry at all, per PROMPT-047 ("Teacher should NOT see Center Admin
   * teacher-management UI"). The backend enforces this too (`/teachers` is `require_administrator`-gated and
   * `/users` scopes a Teacher to their own roster regardless), so hiding the link is a UX nicety, not the only
   * guard. */
  showUsersNav?: boolean;
  showOperationsNav?: boolean;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);
  const adminNav = ADMIN_NAV.filter(item => (showUsersNav || !["users", "levels"].includes(item.key)) && (showOperationsNav || item.key !== "operations"));
  const nav = variant === "student" ? STUDENT_NAV : adminNav;
  const label = (key: string) => t(`sidebar.nav.${variant}.${key}` as MessageKey);
  const moreActive = nav.slice(4).some(item => isActive(pathname, item.href));
  const renderLink = (item: NavItem, compact = false) => (
    <Link key={item.key} href={item.href} onClick={() => setMoreOpen(false)} aria-label={label(item.key)} aria-current={isActive(pathname, item.href) ? "page" : undefined}
      className={`${compact ? "mobile-nav-link" : "flex min-h-12 items-center gap-3 rounded-xl px-3 py-3 text-sm"} ${isActive(pathname, item.href) ? "bg-white text-brand-navy shadow-sm" : "text-white/85 hover:bg-white/10"}`}>
      <Icon name={item.icon} className="size-5 shrink-0" />
      <span className={compact ? "text-[11px] leading-tight" : "min-w-0 flex-1"}>{label(item.key)}</span>
      {!compact && item.key === "submissions" && unreviewedCount > 0 && <b className="rounded-full bg-white/15 px-2 text-xs">{unreviewedCount}</b>}
    </Link>
  );
  return <>
    <aside className="desktop-sidebar fixed inset-y-0 start-0 z-20 hidden w-[232px] flex-col overflow-y-auto bg-brand-navy px-4 py-6 lg:flex">
      <div className="mb-7 flex items-center gap-3 px-2 text-white"><Logo className="size-11" /><Wordmark /></div>
      {canSwitchView && <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-black/15 p-1" aria-label={t("sidebar.switchDashboard")}>
        <Link href="/student" className={`rounded-lg p-3 text-center text-sm ${variant === "student" ? "bg-white text-brand-navy" : "text-white"}`}>{t("sidebar.student")}</Link>
        <Link href="/admin" className={`rounded-lg p-3 text-center text-sm ${variant === "admin" ? "bg-white text-brand-navy" : "text-white"}`}>{t("sidebar.admin")}</Link>
      </div>}
      <nav aria-label={t("mobile.navigation")} className="grid gap-1">{nav.map(item => renderLink(item))}</nav>
      <button onClick={onLogout} className="mt-auto flex min-h-12 items-center gap-3 rounded-xl px-3 pt-5 text-sm text-white"><Icon name="logout" />{t("sidebar.logout")}</button>
    </aside>
    <nav aria-label={t("mobile.navigation")} className="mobile-bottom-nav lg:hidden">
      {nav.slice(0, 4).map(item => renderLink(item, true))}
      <button aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)} className={`mobile-nav-link ${moreActive || moreOpen ? "bg-white text-brand-navy" : "text-white/85"}`}>
        <Menu className="size-5" aria-hidden="true" /><span className="text-[11px]">{t("mobile.more")}</span>
      </button>
    </nav>
    {moreOpen && <Dialog onClose={() => setMoreOpen(false)} dismissOnBackdropClick ariaLabel={t("mobile.more")} className="mobile-more-dialog rounded-3xl border border-line bg-card p-5 text-ink shadow-2xl backdrop:bg-black/45">
      <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">{t("mobile.more")}</h2><DialogCloseButton className="grid size-11 place-items-center rounded-xl border border-line" /></div>
      <nav aria-label={t("mobile.navigation")} className="grid gap-2 rounded-2xl bg-brand-navy p-2">{nav.slice(4).map(item => renderLink(item))}</nav>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><LanguageSwitcher className="min-h-11" />
        {canSwitchView && <Link onClick={() => setMoreOpen(false)} href={variant === "admin" ? "/student" : "/admin"} className="rounded-xl border border-line p-3 text-sm font-bold">{variant === "admin" ? t("topbar.switchToStudent") : t("topbar.switchToAdmin")}</Link>}
      </div>
      <button onClick={() => { setMoreOpen(false); onLogout(); }} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line text-sm font-bold"><Icon name="logout" />{t("sidebar.logout")}</button>
    </Dialog>}
  </>;
}
