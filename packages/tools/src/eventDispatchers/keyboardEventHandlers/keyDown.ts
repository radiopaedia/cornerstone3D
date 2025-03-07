import { ToolGroupManager } from '../../store';
import getActiveToolForKeyboardEvent from '../shared/getActiveToolForKeyboardEvent';
import getToolsWithActionsForKeyboardEvent from '../shared/getToolsWithActionsForKeyboardEvents';
import { KeyDownEventType } from '../../types/EventTypes';
import ToolModes from '../../enums/ToolModes';

/**
 * KeyDown event listener to handle viewport cursor icon changes
 *
 * @param evt - The KeyboardEvent
 */
export default function keyDown(evt: KeyDownEventType): void {
  // get the active tool given the key and mouse button
  const activeTool = getActiveToolForKeyboardEvent(evt);

  if (activeTool) {
    const { renderingEngineId, viewportId } = evt.detail;

    const toolGroup = ToolGroupManager.getToolGroupForViewport(
      viewportId,
      renderingEngineId
    );

    const toolName = activeTool.getToolName();
    if (Object.keys(toolGroup.toolOptions).includes(toolName)) {
      toolGroup.setViewportsCursorByToolName(toolName);
    }
  }

  const activeToolsWithEventBinding = getToolsWithActionsForKeyboardEvent(evt, [
    ToolModes.Active,
  ]);

  if (activeToolsWithEventBinding?.size) {
    const { element } = evt.detail;
    for (const [key, value] of [...activeToolsWithEventBinding.entries()]) {
      key[value.method](element);
    }
  }
}
