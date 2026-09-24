import { ToolRail } from './ToolRail'
import { ToolOptions } from './ToolOptions'
import { CanvasView } from './CanvasView'
import { RightPanel } from './RightPanel'
import { StatusBar } from './StatusBar'

export function Editor() {
  return (
    <div className="editor">
      <ToolRail />
      <ToolOptions />
      <CanvasView />
      <StatusBar />
      <RightPanel />
    </div>
  )
}
