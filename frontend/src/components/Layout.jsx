import SiteFooter from './SiteFooter'
import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

export default function Layout() {
  return <div className="min-h-screen bg-black text-zinc-200">
    <Navbar />
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><Outlet /></main>
    <SiteFooter />
  </div>
}
