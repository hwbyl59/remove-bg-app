import './globals.css';

export const metadata = {
  title: 'Image Background Remover',
  description: 'Remove image backgrounds with AI',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
