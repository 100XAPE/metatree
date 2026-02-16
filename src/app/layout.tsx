import './globals.css'

export const metadata = { 
  title: 'Metatree', 
  description: 'Track the Runner. Find the Branches.' 
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white min-h-screen">{children}</body>
    </html>
  )
}
