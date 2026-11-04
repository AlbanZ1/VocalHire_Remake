import { Moon, Sun } from "@phosphor-icons/react";
import { useTheme } from "@/lib/theme";
import { IconButton } from "../ui/Button";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <IconButton label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={toggle}>
      {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
    </IconButton>
  );
}
