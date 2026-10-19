import type { SavedVault } from '../types'

export interface VaultCatalog { vaults: SavedVault[]; hiddenPaths: string[] }
export const VAULT_CATALOG_KEY = 'pyrite_vault_catalog'
export const normalizeVaultPath = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

function validVault(value: unknown): value is SavedVault {
  const vault = value as SavedVault | null
  return !!vault && typeof vault.path === 'string' && !!vault.path && typeof vault.name === 'string' && typeof vault.id === 'string'
}

export function loadVaultCatalog(storage: Pick<Storage, 'getItem'>): VaultCatalog {
  const saved = storage.getItem(VAULT_CATALOG_KEY)
  if (saved) {
    const catalog = JSON.parse(saved)
    return { vaults: Array.isArray(catalog.vaults) ? catalog.vaults.filter(validVault) : [], hiddenPaths: Array.isArray(catalog.hiddenPaths) ? catalog.hiddenPaths.filter((value: unknown) => typeof value === 'string').map(normalizeVaultPath) : [] }
  }
  const legacy = JSON.parse(storage.getItem('pyrite_saved_vaults') || '[]')
  return { vaults: Array.isArray(legacy) ? legacy.filter(validVault) : [], hiddenPaths: [] }
}

export function mergeVaultCatalog(catalog: VaultCatalog, discovered: SavedVault[], currentPath?: string): VaultCatalog {
  const hidden = new Set(catalog.hiddenPaths.map(normalizeVaultPath))
  const vaults = new Map<string, SavedVault>()
  for (const vault of [...catalog.vaults, ...discovered]) {
    const key = normalizeVaultPath(vault.path)
    if (!hidden.has(key) && !vaults.has(key)) vaults.set(key, vault)
  }
  if (currentPath && !hidden.has(normalizeVaultPath(currentPath)) && !vaults.has(normalizeVaultPath(currentPath))) {
    vaults.set(normalizeVaultPath(currentPath), { id: `current-${normalizeVaultPath(currentPath)}`, name: currentPath.split(/[/\\]/).filter(Boolean).pop() || 'Cofre', path: currentPath, lastOpened: Date.now() })
  }
  return { hiddenPaths: [...hidden], vaults: [...vaults.values()].sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0)) }
}

export function removeVaultFromCatalog(catalog: VaultCatalog, vaultPath: string): VaultCatalog {
  const key = normalizeVaultPath(vaultPath)
  return { vaults: catalog.vaults.filter(vault => normalizeVaultPath(vault.path) !== key), hiddenPaths: [...new Set([...catalog.hiddenPaths, key])] }
}

export function openVaultInCatalog(catalog: VaultCatalog, vaultPath: string): VaultCatalog {
  const key = normalizeVaultPath(vaultPath)
  const previous = catalog.vaults.find(vault => normalizeVaultPath(vault.path) === key)
  const vault = { id: previous?.id || crypto.randomUUID(), name: previous?.name || vaultPath.split(/[/\\]/).filter(Boolean).pop() || 'Cofre', path: vaultPath, lastOpened: Date.now() }
  return { hiddenPaths: catalog.hiddenPaths.filter(value => normalizeVaultPath(value) !== key), vaults: [vault, ...catalog.vaults.filter(value => normalizeVaultPath(value.path) !== key)] }
}
