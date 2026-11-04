"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { UserPublic } from "@/lib/api/types";
import { initials } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { Logo, Wordmark } from "@/components/ui/Logo";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/LocaleProvider";

export function Topbar({ canSwitchView, onLogout, user }: { canSwitchView: boolean; onLogout: () => void; user: UserPublic }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const firstName = user.full_name.split(" ")[0];
  const inStudentView = pathname.startsWith("/student");
  const roleLabel =
    user.role === "root" ? "Root" : user.role === "administrator" ? "Administrator" : user.role === "teacher" ? "Teacher" : (user.assigned_level ?? "No level assigned");

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notificationsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!notificationsRef.current?.contains(e.target as Node)) setNotificationsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notificationsOpen]);

  return (
    <header className="sticky top-0 z-10 flex min-h-[72px] flex-wrap items-center justify-between gap-3 py-3 border-b border-line bg-card px-4 lg:min-h-[86px] lg:px-7.5">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 text-ink lg:hidden"><Logo className="size-10" /><Wordmark className="!text-base" /></div>
      <div className="min-w-0 flex-1 hidden lg:block">
        <h1 className="m-0 mb-1 break-words text-base tracking-tight lg:text-xl">{t("topbar.greeting", { name: firstName })}</h1>
        <p className="m-0 hidden text-xs text-muted lg:block">
          {inStudentView ? t("topbar.subtitleStudent") : t("topbar.subtitleAdmin")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canSwitchView && (
          <button
            type="button"
            onClick={() => router.push(inStudentView ? "/admin" : "/student")}
            className={`hidden sm:flex min-h-11 items-center gap-1.5 rounded-[9px] border border-line bg-card px-2.5 py-2 text-sm font-bold text-ink lg:hidden`}
          >
            <Icon name={inStudentView ? "program" : "practice"} className="size-4" />
            {inStudentView ? t("topbar.switchToAdmin") : t("topbar.switchToStudent")}
          </button>
        )}
        <LanguageSwitcher className="hidden lg:block" />
        <label className="hidden items-center gap-1.5 rounded-[10px] border border-line bg-bg px-2.5 text-muted xl:flex">
          <Icon name="search" className="size-4" />
          <input aria-label={t("common.search")} placeholder={t("common.searchPlaceholder")} className="h-9 w-40 bg-transparent text-xs outline-none" />
        </label>
        <div ref={notificationsRef} className="relative hidden lg:block">
          <button
            type="button"
            aria-label={t("topbar.notifications")}
            aria-expanded={notificationsOpen}
            onClick={() => setNotificationsOpen(o => !o)}
            className="grid size-11 place-items-center rounded-[10px] border border-line bg-card"
          >
            <Icon name="bell" className="size-5" />
          </button>
          {notificationsOpen && (
            <div className="absolute end-0 top-[calc(100%+8px)] w-64 rounded-xl border border-line bg-card p-4 shadow-card">
              <b className="text-sm">{t("topbar.notifications")}</b>
              <p className="m-0 mt-2 text-sm text-muted">{t("topbar.noNotifications")}</p>
            </div>
          )}
        </div>
        <div className="ms-1 flex items-center gap-2">
          <span className="grid size-11 place-items-center rounded-[11px] bg-gradient-to-br from-brand-blue to-brand-cyan text-xs font-extrabold text-white">
            {initials(user.full_name)}
          </span>
          <div className="hidden max-w-36 grid-cols-1 lg:grid xl:max-w-52">
            <b className="truncate text-xs" title={user.full_name}>{user.full_name}</b>
            <small className="mt-0.5 text-[13px] text-muted">{roleLabel}</small>
          </div>
        </div>
        {/* The sidebar's own logout button (`Sidebar.tsx`) is in a
        `hidden lg:block` panel - on mobile that whole panel disappears with
        no other way to log out at all. Duplicated here, icon-only, just for
        the mobile breakpoint the sidebar doesn't cover. */}
        <button
          type="button"
          aria-label={t("sidebar.logout")}
          title={t("sidebar.logout")}
          onClick={onLogout}
          className="grid size-11 place-items-center rounded-[10px] border border-line bg-card text-muted lg:hidden"
        >
          <Icon name="logout" className="size-4.5" />
        </button>
      </div>
    </header>
  );
}
