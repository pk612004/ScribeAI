import './globals.css'

export const metadata = {
  title: 'ScribeAI',
  description: 'Audio scribing prototype'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
