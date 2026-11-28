// Story fixtures imported as URLs (Vite).
declare module "*.glb?url" {
  const url: string;
  export default url;
}
