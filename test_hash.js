function getShortId(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = (hash << 5) - hash + name.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash % 1000).toString().padStart(3, '0');
}
console.log(getShortId("yên lê"));
console.log(getShortId("Yên Lê"));
