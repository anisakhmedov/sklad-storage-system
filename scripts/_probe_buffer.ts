import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("no MONGODB_URI");
  await mongoose.connect(uri);
  console.log("connected");

  const TestSchema = new mongoose.Schema(
    { buf: { type: Buffer, required: true } },
    { collection: "zzz_buffer_probe_tmp" }
  );
  const TestModel =
    mongoose.models.ZzzBufferProbeTmp || mongoose.model("ZzzBufferProbeTmp", TestSchema);

  const original = Buffer.from("hello world - pdf-ish bytes 0123456789", "utf8");
  const created = await TestModel.create({ buf: original });
  console.log("created id:", String(created._id));

  // Read back via lean(), exactly like app/api/acts/[id]/pdf/route.ts does for pdfBuffer.
  const lean = await TestModel.findById(created._id).lean<{ buf: unknown }>();
  const v: any = lean!.buf;

  console.log("=== lean() result diagnostics ===");
  console.log("typeof:", typeof v);
  console.log("constructor name:", v?.constructor?.name);
  console.log("Buffer.isBuffer(v):", Buffer.isBuffer(v));
  console.log("v instanceof Uint8Array:", v instanceof Uint8Array);
  console.log("v._bsontype:", v?._bsontype);
  console.log("v.sub_type:", v?.sub_type);
  console.log("v has .buffer subprop that isBuffer:", v?.buffer ? Buffer.isBuffer(v.buffer) : "n/a");

  try {
    const asUint8 = new Uint8Array(v as Buffer);
    console.log("new Uint8Array(v).length:", asUint8.length, " expected:", original.length);
    console.log("bytes match original:", Buffer.compare(Buffer.from(asUint8), original) === 0);
    console.log("decoded text:", Buffer.from(asUint8).toString("utf8"));
  } catch (e) {
    console.log("new Uint8Array(v) THREW:", (e as Error).message);
  }

  // Also check what a NON-lean (hydrated) document gives, for contrast.
  const hydrated = await TestModel.findById(created._id);
  const hv: any = hydrated!.buf;
  console.log("=== hydrated (non-lean) doc diagnostics ===");
  console.log("constructor name:", hv?.constructor?.name);
  console.log("Buffer.isBuffer(hv):", Buffer.isBuffer(hv));

  // Cleanup - remove the doc and drop the scratch collection, touch nothing else.
  await TestModel.deleteOne({ _id: created._id });
  await mongoose.connection.db?.dropCollection("zzz_buffer_probe_tmp").catch(() => {});
  console.log("cleaned up");

  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  });
