import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SettingsPublic } from '../../../shared/types'
import { ShieldCheck, TriangleAlert } from 'lucide-react'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: SettingsPublic | null
  onSaved: (settings: SettingsPublic) => void
}

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onSaved
}: SettingsDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Model settings</DialogTitle>
          <DialogDescription>
            Bring your own key: any OpenAI-compatible chat completions endpoint works. Nothing is
            baked in.
          </DialogDescription>
        </DialogHeader>
        {/* Mounts fresh on each open, so state initializers read current settings. */}
        <SettingsForm settings={settings} onSaved={onSaved} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function SettingsForm({
  settings,
  onSaved,
  onClose
}: {
  settings: SettingsPublic | null
  onSaved: (settings: SettingsPublic) => void
  onClose: () => void
}): React.JSX.Element {
  const [baseUrl, setBaseUrl] = useState(settings?.baseUrl ?? '')
  const [model, setModel] = useState(settings?.model ?? '')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)

  const save = (): void => {
    setSaving(true)
    void window.api
      .updateSettings({
        baseUrl,
        model,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {})
      })
      .then((updated) => {
        onSaved(updated)
        onClose()
      })
      .finally(() => setSaving(false))
  }

  const clearKey = (): void => {
    void window.api.updateSettings({ apiKey: null }).then(onSaved)
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="base-url">Base URL</Label>
        <Input
          id="base-url"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="https://api.openai.com/v1"
          spellCheck={false}
          className="font-mono text-xs"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="model-id">Model ID</Label>
        <Input
          id="model-id"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder="e.g. gpt-4.1-mini, claude-…, llama-…"
          spellCheck={false}
          className="font-mono text-xs"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="api-key">API key</Label>
        <Input
          id="api-key"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={settings?.hasApiKey ? '••••••••  (a key is saved)' : 'sk-…'}
          spellCheck={false}
          className="font-mono text-xs"
        />
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          {settings?.encryptionAvailable ? (
            <>
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
              Stored on disk encrypted with the OS keychain. Never sent anywhere except your
              endpoint.
            </>
          ) : (
            <>
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
              No OS keychain available — the key is stored in a chmod-600 file in the app&apos;s
              user data directory.
            </>
          )}
        </p>
        {settings?.hasApiKey && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearKey}
            className="self-start text-xs text-destructive hover:text-destructive"
          >
            Remove saved key
          </Button>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}
