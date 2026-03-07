/**
 * vaultStore.ts
 *
 * Store Zustand gérant le cycle de vie du vault cryptographique ROOT.
 *
 * GARANTIES ZERO-KNOWLEDGE :
 *  - La CryptoKey vit UNIQUEMENT dans ce store, en RAM.
 *  - Le middleware 'persist' de Zustand N'EST PAS utilisé ici —
 *    le state n'est jamais sérialisé ni écrit dans localStorage/sessionStorage.
 *  - lock() supprime la référence à la CryptoKey. Le Garbage Collector JS
 *    récupère la mémoire ; il n'existe aucun moyen d'y accéder après.
 *  - Le Master Password n'est JAMAIS stocké dans ce store — il transite
 *    uniquement comme paramètre de fonction le temps de la dérivation.
 */

import { create } from "zustand";
import { vaultService } from "@/lib/VaultService";
import { db } from "@/lib/database";

// ── Types ─────────────────────────────────────────────────────────────────────

export type VaultStatus =
  | "uninitialized" // premier lancement : aucun vault en base
  | "locked"        // vault existant, clé absente de la RAM
  | "unlocked"      // clé présente en RAM, opérations possibles
  | "error";        // état d'erreur irrécupérable

interface VaultState {
  status: VaultStatus;
  /** CryptoKey AES-GCM — null si locked ou uninitialized */
  key: CryptoKey | null;
  /** Raccourci booléen pour les composants */
  isUnlocked: boolean;
  /** Dernier message d'erreur */
  lastError: string | null;

  // Actions
  /**
   * Détecte si un vault existe déjà dans IndexedDB.
   * À appeler au démarrage de l'application.
   */
  checkVaultExists: () => Promise<void>;

  /**
   * Initialise le vault pour la première fois.
   * Génère un salt, dérive la clé, crée le verifier, persiste vault_meta.
   *
   * @param password - Master Password saisi par l'utilisateur (jamais persisté)
   */
  initVault: (password: string) => Promise<void>;

  /**
   * Déverrouille un vault existant.
   * Re-dérive la clé à partir du salt stocké, vérifie le verifier.
   *
   * @param password - Master Password saisi par l'utilisateur
   * @returns true si succès, false si mot de passe incorrect
   */
  unlock: (password: string) => Promise<boolean>;

  /**
   * Verrouille le vault : supprime la CryptoKey de la RAM.
   * Toute opération cryptographique sera impossible jusqu'au prochain unlock.
   */
  lock: () => void;

  /**
   * Raccourci : retourne la clé ou lance une exception si le vault est verrouillé.
   * Utilisé par les services qui nécessitent la clé.
   */
  requireKey: () => CryptoKey;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useVaultStore = create<VaultState>()((set, get) => ({
  status: "locked",
  key: null,
  isUnlocked: false,
  lastError: null,

  // ── checkVaultExists ──────────────────────────────────────────────────────

  checkVaultExists: async () => {
    try {
      const meta = await db.vault_meta.get(1);
      set({
        status: meta ? "locked" : "uninitialized",
        lastError: null,
      });
    } catch (err) {
      set({
        status: "error",
        lastError: String(err),
      });
    }
  },

  // ── initVault ─────────────────────────────────────────────────────────────

  initVault: async (password: string) => {
    try {
      const salt = vaultService.generateSalt();
      const key = await vaultService.deriveKey(password, salt);
      const verifier = await vaultService.createVerifier(key);

      await db.vault_meta.put({
        id: 1,
        salt: vaultService.saltToB64(salt),
        verifier,
        schemaVersion: 1,
        createdAt: Date.now(),
      });

      // Le Master Password sort de portée ici — seule la CryptoKey reste
      set({ key, status: "unlocked", isUnlocked: true, lastError: null });
    } catch (err) {
      set({ status: "error", lastError: String(err) });
      throw err;
    }
  },

  // ── unlock ────────────────────────────────────────────────────────────────

  unlock: async (password: string): Promise<boolean> => {
    try {
      const meta = await db.vault_meta.get(1);
      if (!meta) {
        set({ status: "uninitialized" });
        return false;
      }

      const salt = vaultService.b64ToSalt(meta.salt);
      const key = await vaultService.deriveKey(password, salt);
      const valid = await vaultService.verifyKey(key, meta.verifier);

      if (valid) {
        set({ key, status: "unlocked", isUnlocked: true, lastError: null });
      } else {
        // Mauvais mot de passe : on ne garde aucune trace de la tentative
        set({ key: null, status: "locked", lastError: "Invalid password" });
      }

      return valid;
    } catch (err) {
      set({ status: "error", lastError: String(err) });
      throw err;
    }
  },

  // ── lock ──────────────────────────────────────────────────────────────────

  lock: () => {
    // Suppression de la référence → la CryptoKey devient éligible au GC
    set({ key: null, status: "locked", isUnlocked: false, lastError: null });
  },

  // ── requireKey ───────────────────────────────────────────────────────────

  requireKey: (): CryptoKey => {
    const { key, status } = get();
    if (!key || status !== "unlocked") {
      throw new Error(
        "[ROOT] Vault is locked. Cannot perform cryptographic operations."
      );
    }
    return key;
  },
}));

// ── Helpers exportés ──────────────────────────────────────────────────────────

/**
 * Chiffre une valeur quelconque (sera sérialisée en JSON) avec la clé du vault.
 * Lance une exception si le vault est verrouillé.
 */
export async function encryptValue<T>(value: T) {
  const key = useVaultStore.getState().requireKey();
  return vaultService.encrypt(key, JSON.stringify(value));
}

/**
 * Déchiffre un EncryptedPayload et désérialise le JSON obtenu.
 * Lance une exception si le vault est verrouillé ou si les données sont corrompues.
 */
export async function decryptValue<T>(payload: import("@/lib/VaultService").EncryptedPayload): Promise<T> {
  const key = useVaultStore.getState().requireKey();
  const json = await vaultService.decrypt(key, payload);
  return JSON.parse(json) as T;
}
