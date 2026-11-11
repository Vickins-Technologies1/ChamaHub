declare module "html5-qrcode" {
  export class Html5QrcodeScanner {
    constructor(
      elementId: string,
      config: { fps?: number; qrbox?: number | { width: number; height: number } },
      verbose?: boolean
    );
    render(
      onSuccess: (decodedText: string) => void,
      onError?: (error: string) => void
    ): void;
    clear(): Promise<void>;
  }
}
