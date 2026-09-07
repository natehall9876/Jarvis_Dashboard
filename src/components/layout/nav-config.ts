import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarDays,
  FileText,
  Home,
  LayoutDashboard,
  MapPinned,
  Receipt,
  Route,
  Settings,
  Sparkles,
  Users,
  UserSquare2,
  Wallet,
  Wrench,
  Briefcase,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Command Center", href: "/", icon: Home },
  { label: "Schedule", href: "/schedule", icon: CalendarDays },
  { label: "Clients", href: "/clients", icon: Users },
  { label: "Properties", href: "/properties", icon: MapPinned },
  { label: "Jobs", href: "/jobs", icon: Briefcase },
  { label: "Routes", href: "/routes", icon: Route },
  { label: "Quotes", href: "/quotes", icon: FileText },
  { label: "Invoices", href: "/invoices", icon: Receipt },
  { label: "Employees", href: "/employees", icon: UserSquare2 },
  { label: "Equipment", href: "/equipment", icon: Wrench },
  { label: "Expenses", href: "/expenses", icon: Wallet },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "AI Advisor", href: "/ai-advisor", icon: Sparkles },
  { label: "Settings", href: "/settings", icon: Settings },
];

export const BRAND = {
  name: "Jarvis",
  subtitle: "WeedEater Lawn Care",
  icon: LayoutDashboard,
};
