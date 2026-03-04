---
name: obsidian-cli
description: Skill for the official Obsidian CLI (v1.12+). Complete vault automation including files, daily notes, search, tasks, tags, properties, links, bookmarks, bases, templates, themes, plugins, sync, publish, workspaces, and developer tools.
version: 2.0.0
author: adolago
tags:
  - obsidian
  - cli
  - notes
  - automation
  - vault
triggers:
  - obsidian
  - vault
  - daily note
  - obsidian cli
---

# Obsidian CLI (Official, v1.12+)

The official Obsidian CLI connects to a running Obsidian instance via IPC.
Requires Obsidian 1.12+ with CLI enabled in Settings > General.

## Prerequisites

- **Obsidian 1.12+** installed and running
- CLI enabled: Settings > General > Enable CLI
- The `obsidian` binary must be in your PATH

**Important**: Obsidian must be running for CLI commands to work. The CLI communicates
with the running instance via IPC.

### Platform Notes

- **macOS/Windows**: The Obsidian installer typically places the CLI binary in PATH automatically.
- **Linux**: You may need a wrapper script to avoid Electron flag injection that breaks CLI arg parsing. Ensure your wrapper is in PATH before the system `obsidian` binary. If running as a service, ensure `PrivateTmp=false` for IPC to work.

## Complete Command Reference

### Basics

```bash
obsidian version                            # Show Obsidian version
obsidian help                               # List all available commands
obsidian vault                              # Show vault info (name, path, files, size)
obsidian vault info=name                    # Just vault name
obsidian vault info=path                    # Just vault path
obsidian reload                             # Reload the vault
obsidian restart                            # Restart the app
```

### Daily Notes

```bash
obsidian daily                              # Open today's daily note
obsidian daily silent                       # Open without focusing
obsidian daily:read                         # Read daily note contents
obsidian daily:append content="- [ ] Task"  # Append to daily note
obsidian daily:prepend content="# Header"   # Prepend to daily note
obsidian daily paneType=tab                 # Open in new tab (tab|split|window)
```

### Files

```bash
obsidian read file=Recipe                   # Read by name (wikilink resolution)
obsidian read path="Work/notes.md"          # Read by exact path
obsidian file file=Recipe                   # Show file info (path, size, dates)
obsidian create name=Note content="Hello"   # Create a new note
obsidian create name=Note template=Travel   # Create from template
obsidian create path="Work/note.md" content="text"  # Create at exact path
obsidian create name=Note overwrite         # Overwrite if exists
obsidian create name=Note silent newtab     # Create silently in new tab
obsidian open file=Recipe                   # Open in Obsidian
obsidian open file=Recipe newtab            # Open in new tab
obsidian delete file=Old                    # Delete (to trash)
obsidian delete file=Old permanent          # Delete permanently
obsidian move file=Old to="Archive/Old.md"  # Move/rename (include .md in target)
obsidian append file=Log content="Entry"    # Append to file
obsidian append file=Log content="text" inline  # Append inline (no newline)
obsidian prepend file=Log content="Header"  # Prepend to file
obsidian unique name="Meeting" content="notes"  # Create note with unique timestamp
obsidian wordcount file=Note                # Word and character count
obsidian random                             # Open a random note
obsidian random:read                        # Read a random note
obsidian random folder="Work"               # Random note from folder
obsidian recents                            # List recently opened files
```

### Search

```bash
obsidian search query="meeting notes"               # Search vault
obsidian search query="TODO" matches                 # Show match context
obsidian search query="project" path="Work" limit=10 # Scoped search
obsidian search query="test" format=json             # JSON output
obsidian search query="Bug" case                     # Case-sensitive search
obsidian search query="error" total                  # Count matches only
obsidian search:open query="TODO"                    # Open search view in Obsidian
```

### Tasks

```bash
obsidian tasks daily                        # Tasks from daily note
obsidian tasks daily todo                   # Incomplete daily tasks
obsidian tasks daily done                   # Completed daily tasks
obsidian tasks all todo                     # All incomplete tasks in vault
obsidian tasks file=Recipe done             # Completed tasks in file
obsidian tasks verbose                      # Tasks with file paths + line numbers
obsidian tasks total                        # Count of tasks
obsidian task daily line=3 toggle           # Toggle task completion
obsidian task daily line=3 done             # Mark task done
obsidian task daily line=3 todo             # Mark task incomplete
obsidian task ref="Work/todo.md:5" toggle   # Toggle by file:line reference
```

### Tags & Properties

```bash
obsidian tags all counts                    # All tags with counts
obsidian tags file=Note                     # Tags in specific file
obsidian properties all counts              # All properties with counts
obsidian properties file=Note               # Properties of specific file
obsidian property:read name=status file=Note       # Read a property value
obsidian property:set name=status value=done file=Note  # Set a property
obsidian property:remove name=status file=Note     # Remove a property
obsidian aliases                            # List all aliases in vault
```

### Links & Structure

```bash
obsidian backlinks file=Note                # Files linking to Note
obsidian links file=Note                    # Outgoing links from Note
obsidian orphans                            # Files with no incoming links
obsidian deadends                           # Files with no outgoing links
obsidian unresolved                         # Broken/unresolved links
obsidian outline file=Note                  # Headings tree
```

### Vault Info

```bash
obsidian files total                        # File count
obsidian files folder="Work" ext=md         # Filter by folder and extension
obsidian folders                            # List all folders
obsidian vaults                             # List known vaults
obsidian vault=Notes daily                  # Target specific vault
```

### Bookmarks

```bash
obsidian bookmarks                          # List all bookmarks
obsidian bookmark file="Work/note.md"       # Bookmark a file
obsidian bookmark search="TODO"             # Bookmark a search query
```

### Templates

```bash
obsidian templates                          # List available templates
obsidian template:read name=Daily           # Read template content
obsidian template:insert name=Daily         # Insert template into active file
```

### Plugins & Themes

```bash
obsidian plugins                            # List all installed plugins
obsidian plugins:enabled                    # List enabled plugins
obsidian plugin:enable id=dataview          # Enable plugin
obsidian plugin:disable id=dataview         # Disable plugin
obsidian plugin:install id=dataview enable  # Install and enable
obsidian themes                             # List installed themes
obsidian theme:set name="Minimal"           # Set active theme
```

### Tabs & Workspaces

```bash
obsidian tabs                               # List open tabs
obsidian tab:open file="Work/note.md"       # Open file in new tab
obsidian workspaces                         # List saved workspaces
obsidian workspace:save name="coding"       # Save current layout
obsidian workspace:load name="coding"       # Load saved workspace
```

### Sync & Publish

```bash
obsidian sync:status                        # Show sync status
obsidian sync on                            # Resume sync
obsidian sync off                           # Pause sync
obsidian publish:status                     # List all publish changes
obsidian publish:add file=Note              # Publish a file
obsidian publish:add changed                # Publish all changed files
```

### Developer Tools

```bash
obsidian eval code="app.vault.getFiles().length"  # Run JS in Obsidian context
obsidian dev:screenshot path=screenshot.png        # Screenshot to file
obsidian dev:debug on                              # Attach CDP debugger
obsidian dev:console                               # Show captured console messages
```

## Parameter Syntax

- `param=value` for parameters (quote spaces: `content="Hello world"`)
- Bare words for flags: `obsidian tasks daily todo verbose`
- `file=<name>` resolves like wikilinks (name only, no path/extension needed)
- `path=<path>` requires exact path from vault root
- `vault=<name>` must be the FIRST parameter to target a specific vault

## Troubleshooting

- **"Cannot connect"**: Ensure Obsidian is running and CLI is enabled in Settings > General.
- **"Command not found"**: Ensure the `obsidian` binary is in your PATH.
- **Linux IPC issues**: If running headless or as a service, ensure the IPC socket is accessible (no `PrivateTmp`, correct user context).
