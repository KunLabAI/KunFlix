"use client"

import type { Editor } from "@tiptap/react"
import { useCurrentEditor, useEditorState } from "@tiptap/react"
import { useEffect, useState } from "react"

function getActivePageEditor(editor: Editor): Editor | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storage = (editor.storage as any).pages
  return (storage && "activeEditor" in storage) ? (storage.activeEditor as Editor) ?? null : null
}

export function useTiptapEditor(providedEditor?: Editor | null): {
  editor: Editor | null
  editorState?: Editor["state"]
  canCommand?: Editor["can"]
} {
  const { editor: coreEditor } = useCurrentEditor()
  const mainEditor = providedEditor ?? coreEditor

  const [storageEditor, setStorageEditor] = useState<Editor | null>(null)

  useEffect(() => {
    if (!mainEditor) {
      setStorageEditor(null)
      return
    }

    const updateHandler = () =>
      setStorageEditor(getActivePageEditor(mainEditor))

    updateHandler()

    mainEditor.on("update", updateHandler)
    mainEditor.on("selectionUpdate", updateHandler)

    return () => {
      mainEditor.off("update", updateHandler)
      mainEditor.off("selectionUpdate", updateHandler)
    }
  }, [mainEditor])

  useEffect(() => {
    if (!storageEditor) return

    const handleDestroy = () => setStorageEditor(null)

    storageEditor.on("destroy", handleDestroy)
    return () => {
      storageEditor.off("destroy", handleDestroy)
    }
  }, [storageEditor])

  const editorState = useEditorState({
    editor: storageEditor ?? mainEditor,
    selector(context) {
      if (!context.editor) {
        return { editor: null, editorState: undefined, canCommand: undefined }
      }

      return {
        editor: context.editor,
        editorState: context.editor.state,
        canCommand: context.editor.can,
      }
    },
  })

  return editorState ?? { editor: null }
}
