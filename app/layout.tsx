import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Class Attendance',description:'Class check-ins and attendance register',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
