import { useEffect, useRef } from 'react'
import { Globe } from 'lucide-react'

/**
 * Placeholder area the main process positions the guest WebContentsView over.
 * The empty state below is only visible before the first page paints.
 */
export function BrowserPane(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const report = (): void => {
      const rect = element.getBoundingClientRect()
      window.api.setBrowserBounds({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      })
    }

    report()
    const observer = new ResizeObserver(report)
    observer.observe(element)
    window.addEventListener('resize', report)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [])

  return (
    <div ref={ref} className="relative min-w-0 flex-1 bg-muted/30">
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Globe className="size-8 opacity-40" />
        <p className="text-sm">Loading the page…</p>
      </div>
    </div>
  )
}
