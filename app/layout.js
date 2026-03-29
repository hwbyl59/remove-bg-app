import './globals.css';
import Script from 'next/script';

export const metadata = {
  title: 'Image Background Remover',
  description: 'Remove image backgrounds with AI',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
