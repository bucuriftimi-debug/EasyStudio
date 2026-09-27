import { useEditor } from '../../state/store'
import { NewDocDialog } from './NewDocDialog'
import { ResizeDialog, CanvasSizeDialog } from './SizeDialogs'
import { ExportDialog } from './ExportDialog'
import { AboutDialog } from './AboutDialog'
import { SelModifyDialog } from './SelModifyDialog'
import { AiSettingsDialog } from './AiSettingsDialog'
import { GenFillDialog } from './GenFillDialog'
import { CollageDialog } from './CollageDialog'
import { RetouchDialog } from './RetouchDialog'
import { BatchDialog } from './BatchDialog'

export function Dialogs() {
  const dialog = useEditor((s) => s.dialog)
  const hasDoc = useEditor((s) => !!s.hist)
  const close = () => useEditor.setState({ dialog: null })
  switch (dialog) {
    case 'new':
      return <NewDocDialog onClose={close} />
    case 'resize':
      return hasDoc ? <ResizeDialog onClose={close} /> : null
    case 'canvas':
      return hasDoc ? <CanvasSizeDialog onClose={close} /> : null
    case 'export':
      return hasDoc ? <ExportDialog onClose={close} /> : null
    case 'about':
      return <AboutDialog onClose={close} />
    case 'selmodify':
      return hasDoc ? <SelModifyDialog onClose={close} /> : null
    case 'aisettings':
      return <AiSettingsDialog onClose={close} />
    case 'batch':
      return <BatchDialog onClose={close} />
    case 'retouch':
      return hasDoc ? <RetouchDialog onClose={close} /> : null
    case 'collage':
      return <CollageDialog onClose={close} />
    case 'genfill':
      return hasDoc ? <GenFillDialog onClose={close} /> : null
    default:
      return null
  }
}
