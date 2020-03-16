import { ChainId } from "@iov/bcp";

import { Caip5 } from "./caip5";

describe("Caip5", () => {
  describe("encode", () => {
    it("works for direct format", () => {
      expect(Caip5.encode("foo")).toEqual("enigma:foo");
      expect(Caip5.encode("aA1-")).toEqual("enigma:aA1-");
      expect(Caip5.encode("12345678901234567890123456789012345678901234567")).toEqual(
        "enigma:12345678901234567890123456789012345678901234567",
      );

      // Test vectors from CAIP-5
      expect(Caip5.encode("enigma-1")).toEqual("enigma:enigma-1");
      expect(Caip5.encode("Binance-Chain-Tigris")).toEqual("enigma:Binance-Chain-Tigris");
      expect(Caip5.encode("x")).toEqual("enigma:x");
      expect(Caip5.encode("hash-")).toEqual("enigma:hash-");
      expect(Caip5.encode("hashed")).toEqual("enigma:hashed");
    });

    it("works for hashed format", () => {
      // Test vectors from CAIP-5
      expect(Caip5.encode("hashed-")).toEqual("enigma:hashed-c904589232422def");
      expect(Caip5.encode("hashed-123")).toEqual("enigma:hashed-99df5cd68192b33e");
      expect(Caip5.encode("123456789012345678901234567890123456789012345678")).toEqual(
        "enigma:hashed-0204c92a0388779d",
      );
      expect(Caip5.encode(" ")).toEqual("enigma:hashed-36a9e7f1c95b82ff");
      expect(Caip5.encode("wonderland🧝‍♂️")).toEqual("enigma:hashed-843d2fc87f40eeb9");
    });

    it("throws for empty input", () => {
      expect(() => Caip5.encode("")).toThrowError(/must not be empty/i);
    });
  });

  describe("decode", () => {
    it("works for valid format", () => {
      expect(Caip5.decode("enigma:x" as ChainId)).toEqual("x");
      expect(Caip5.decode("enigma:foo" as ChainId)).toEqual("foo");
      expect(Caip5.decode("enigma:aA1-" as ChainId)).toEqual("aA1-");
      expect(Caip5.decode("enigma:12345678901234567890123456789012345678901234567" as ChainId)).toEqual(
        "12345678901234567890123456789012345678901234567",
      );
    });

    it("throws for invalid format", () => {
      // wrong namespace
      expect(() => Caip5.decode(":foobar" as ChainId)).toThrowError(/not compatible with CAIP-5/i);
      expect(() => Caip5.decode("xyz:foobar" as ChainId)).toThrowError(/not compatible with CAIP-5/i);
      expect(() => Caip5.decode("enigma-hash:foobar" as ChainId)).toThrowError(/not compatible with CAIP-5/i);

      // reference too short
      expect(() => Caip5.decode("enigma:" as ChainId)).toThrowError(/not compatible with CAIP-5/i);

      // reference too long
      expect(() =>
        Caip5.decode("enigma:123456789012345678901234567890123456789012345678" as ChainId),
      ).toThrowError(/not compatible with CAIP-5/i);

      // invalid chars
      expect(() => Caip5.decode("enigma:foo bar" as ChainId)).toThrowError(/not compatible with CAIP-5/i);
      expect(() => Caip5.decode("enigma:wonder🧝‍♂️" as ChainId)).toThrowError(/not compatible with CAIP-5/i);
    });

    it("throws for hashed chain IDs", () => {
      expect(() => Caip5.decode("enigma:hashed-" as ChainId)).toThrowError(
        /hashed chain IDs cannot be decoded/i,
      );
      expect(() => Caip5.decode("enigma:hashed-abab" as ChainId)).toThrowError(
        /hashed chain IDs cannot be decoded/i,
      );
      expect(() => Caip5.decode("enigma:hashed-6abb36860ec76c5a" as ChainId)).toThrowError(
        /hashed chain IDs cannot be decoded/i,
      );
    });
  });
});
