import './globals.css'
import { cn } from '@/lib/utils'
import { JetBrains_Mono } from 'next/font/google'

const mono = JetBrains_Mono({ subsets: ['latin'] })

export const metadata = { 
  title: 'METATREE | Derivative Detection System', 
  description: 'Track the runner. Catch the meta. Real-time Solana derivative scanner.',
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={cn(mono.className, "min-h-screen bg-background antialiased")}>
        {children}
      </body>
    </html>
  )
}
