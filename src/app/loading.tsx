import { Loader2 } from "lucide-react"

export default function Loading() {
  return (
    <div className="flex justify-center items-center h-screen bg-[#F2F0EF]">
      <Loader2 className="w-16 h-16 animate-spin text-[#087830]" />
    </div>
  )
}