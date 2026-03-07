/**
 * VaultService.ts
 *
 * Couche cryptographique centrale d'ROOT.
 * Toutes les opérations utilisent la Web Crypto API native (FIPS 140-2).
 *
 * GARANTIES DE SÉCURITÉ :
 *  - La CryptoKey est créée avec extractable: false → les octets bruts
 *    ne peuvent jamais être exportés via l'API, même accidentellement.
 *  - Un IV de 96 bits (recommandé GCM) est généré de façon aléatoire
 *    à chaque appel d'encrypt() → aucune réutilisation de nonce possible.
 *  - PBKDF2 à 600 000 itérations + SHA-256 → coût brute-force prohibitif.
 *  - Le verifier est un texte chiffré d'une constante connue ;
 *    il permet de valider le mot de passe sans stocker ce dernier.
 */

// ── Constantes ────────────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 600_000;
const KEY_ALGORITHM = { name: "AES-GCM", length: 256 } as const;
const SALT_BYTES = 32; // 256 bits
const IV_BYTES = 12; // 96 bits — taille recommandée pour AES-GCM
const VERIFIER_SENTINEL = "__ROOT_VAULT_v1__";

// ── Types publics ─────────────────────────────────────────────────────────────

/**
 * Représentation stockable d'un message chiffré AES-GCM.
 * Les deux champs sont encodés en base64 pour la sérialisation JSON / IndexedDB.
 */
export interface EncryptedPayload {
  /** IV (nonce) — 96 bits, base64 */
  iv: string;
  /** Ciphertext + auth tag 128 bits, base64 */
  data: string;
}

// ── Utilitaires de conversion ─────────────────────────────────────────────────

function bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// ── VaultService ──────────────────────────────────────────────────────────────

class VaultService {
  private readonly enc = new TextEncoder();
  private readonly dec = new TextDecoder();

  /**
   * Génère un salt cryptographique aléatoire de 256 bits.
   * À stocker en clair dans vault_meta (le salt n'est pas secret).
   */
  generateSalt(): Uint8Array<ArrayBuffer> {
    const buf = new Uint8Array(SALT_BYTES) as Uint8Array<ArrayBuffer>;
    crypto.getRandomValues(buf);
    return buf;
  }

  /**
   * Dérive une CryptoKey AES-GCM-256 à partir du Master Password.
   *
   * @param password  - Le Master Password (jamais persisté)
   * @param salt      - Salt récupéré depuis vault_meta
   * @returns CryptoKey avec extractable = false
   *
   * SÉCURITÉ : extractable: false interdit toute exportation de la clé,
   * y compris via crypto.subtle.exportKey(). La clé ne peut qu'être
   * utilisée pour encrypt/decrypt dans la même session.
   */
  async deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      this.enc.encode(password),
      { name: "PBKDF2" },
      false, // non-extractable dès l'import
      ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      keyMaterial,
      KEY_ALGORITHM,
      false, // CRITIQUE : la clé dérivée ne peut jamais être exportée
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Chiffre une chaîne avec AES-GCM-256.
   * Un IV aléatoire frais est généré à chaque appel.
   *
   * @param key       - CryptoKey AES-GCM dérivée (en RAM uniquement)
   * @param plaintext - Texte clair (sera effacé du GC après l'appel)
   */
  async encrypt(key: CryptoKey, plaintext: string): Promise<EncryptedPayload> {
    const iv = new Uint8Array(IV_BYTES) as Uint8Array<ArrayBuffer>;
    crypto.getRandomValues(iv);

    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      this.enc.encode(plaintext)
    );

    return {
      iv: bufToB64(iv.buffer),
      data: bufToB64(ciphertext),
    };
  }

  /**
   * Déchiffre un EncryptedPayload AES-GCM-256.
   * Lance une DOMException si l'auth tag est invalide (mauvaise clé ou
   * données altérées) — l'appelant doit gérer ce cas explicitement.
   */
  async decrypt(key: CryptoKey, payload: EncryptedPayload): Promise<string> {
    const iv = new Uint8Array(b64ToBuf(payload.iv));
    const data = b64ToBuf(payload.data);

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );

    return this.dec.decode(plaintext);
  }

  /**
   * Chiffre la constante sentinelle avec la clé courante.
   * Le résultat est stocké dans vault_meta.verifier.
   * Lors du déchiffrement, si la valeur obtenue correspond à la sentinelle,
   * le mot de passe est correct.
   */
  async createVerifier(key: CryptoKey): Promise<EncryptedPayload> {
    return this.encrypt(key, VERIFIER_SENTINEL);
  }

  /**
   * Vérifie que la CryptoKey correspond bien au mot de passe utilisé lors
   * de l'initialisation du vault.
   *
   * @returns true si la clé est valide, false si le mot de passe est incorrect
   *
   * SÉCURITÉ : L'authentification AES-GCM garantit qu'une falsification du
   * verifier ou une clé incorrecte provoque une exception (pas un faux positif).
   */
  async verifyKey(
    key: CryptoKey,
    verifier: EncryptedPayload
  ): Promise<boolean> {
    try {
      const result = await this.decrypt(key, verifier);
      return result === VERIFIER_SENTINEL;
    } catch {
      // DOMException "OperationError" → auth tag invalide → mauvaise clé
      return false;
    }
  }

  /**
   * Sérialise un salt Uint8Array en base64 pour stockage dans IndexedDB.
   */
  saltToB64(salt: Uint8Array<ArrayBuffer>): string {
    return bufToB64(salt.buffer);
  }

  /**
   * Désérialise un salt base64 depuis IndexedDB.
   */
  b64ToSalt(b64: string): Uint8Array<ArrayBuffer> {
    return new Uint8Array(b64ToBuf(b64)) as Uint8Array<ArrayBuffer>;
  }
}

// Singleton — une seule instance pour toute l'application
export const vaultService = new VaultService();
