import { Fraunces, Outfit } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
});

const sans = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata = {
  title: "Poker Night",
  description: "Private play-money poker rooms for you and your friends.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full bg-[#0b0908] font-sans text-zinc-100 antialiased">
        {children}
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
