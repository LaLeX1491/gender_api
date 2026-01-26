export default function getFormat(file: File): string | undefined {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if(!extension) return undefined;
    return extension;
}