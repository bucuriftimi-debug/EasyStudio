// StoreHelper.exe — asks the Microsoft Store whether the user owns the "Pro" add-on, and shows the
// Store's purchase window. The Electron apps start it as a child process (it inherits the MSIX
// package identity) and read one line of JSON from its output.
//
//   StoreHelper.exe status <offerToken>
//   StoreHelper.exe buy <offerToken> <hwnd>
//
// Built by tools/build-store-helper.cjs with the C# compiler that ships with .NET Framework 4.x,
// so it needs nothing that is not already part of Windows 10/11.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using Windows.Foundation;
using Windows.Services.Store;

[ComImport, Guid("3E68D4BD-7135-4D10-8018-9FB6D9F33FA1"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IInitializeWithWindow
{
    void Initialize(IntPtr hwnd);
}

static class Program
{
    static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        try
        {
            if (args.Length < 2) throw new ArgumentException("usage: status <token> | buy <token> <hwnd>");
            string json = args[0] == "buy" ? Buy(args[1], args.Length > 2 ? args[2] : "0").GetAwaiter().GetResult()
                                           : Status(args[1]).GetAwaiter().GetResult();
            Console.WriteLine(json);
            return 0;
        }
        catch (Exception e)
        {
            Console.WriteLine("{\"ok\":false,\"error\":" + Str(e.Message + " (0x" + e.HResult.ToString("X8") + ")") + "}");
            return 1;
        }
    }

    static async Task<bool> OwnsAddOn(StoreContext ctx, string token)
    {
        StoreAppLicense license = await Run(ctx.GetAppLicenseAsync());
        foreach (KeyValuePair<string, StoreLicense> item in license.AddOnLicenses)
        {
            if (item.Value.IsActive && string.Equals(item.Value.InAppOfferToken, token, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    static async Task<StoreProduct> FindAddOn(StoreContext ctx, string token)
    {
        StoreProductQueryResult result = await Run(ctx.GetAssociatedStoreProductsAsync(new[] { "Durable" }));
        if (result.ExtendedError != null) throw result.ExtendedError;
        foreach (KeyValuePair<string, StoreProduct> item in result.Products)
        {
            if (string.Equals(item.Value.InAppOfferToken, token, StringComparison.OrdinalIgnoreCase)) return item.Value;
        }
        return null;
    }

    static async Task<string> Status(string token)
    {
        StoreContext ctx = StoreContext.GetDefault();
        bool pro = await OwnsAddOn(ctx, token);
        string price = null;
        if (!pro)
        {
            // The price is only for the button; being offline must not break the license check.
            try
            {
                StoreProduct p = await FindAddOn(ctx, token);
                if (p != null) price = p.Price.FormattedPrice;
            }
            catch (Exception) { }
        }
        return "{\"ok\":true,\"pro\":" + (pro ? "true" : "false") + ",\"price\":" + Str(price) + "}";
    }

    static async Task<string> Buy(string token, string hwnd)
    {
        StoreContext ctx = StoreContext.GetDefault();
        // A desktop app must tell the Store which window owns the purchase dialog.
        ((IInitializeWithWindow)(object)ctx).Initialize(new IntPtr(long.Parse(hwnd)));
        StoreProduct product = await FindAddOn(ctx, token);
        if (product == null) return "{\"ok\":false,\"error\":\"add-on not found\"}";
        StorePurchaseResult r = await Run(ctx.RequestPurchaseAsync(product.StoreId));
        string error = r.ExtendedError != null ? r.ExtendedError.Message : null;
        bool pro = await OwnsAddOn(ctx, token);
        return "{\"ok\":true,\"pro\":" + (pro ? "true" : "false") + ",\"status\":" + Str(r.Status.ToString()) + ",\"error\":" + Str(error) + "}";
    }

    // The C# 5 compiler cannot see the WinRT awaiter in the split metadata files, so adapt by hand.
    static Task<T> Run<T>(IAsyncOperation<T> op)
    {
        TaskCompletionSource<T> tcs = new TaskCompletionSource<T>();
        op.Completed = (o, status) =>
        {
            if (status == AsyncStatus.Completed) tcs.TrySetResult(o.GetResults());
            else if (status == AsyncStatus.Error) tcs.TrySetException(o.ErrorCode);
            else tcs.TrySetCanceled();
        };
        return tcs.Task;
    }

    static string Str(string s)
    {
        if (s == null) return "null";
        StringBuilder b = new StringBuilder("\"");
        foreach (char c in s)
        {
            if (c == '"' || c == '\\') b.Append('\\').Append(c);
            else if (c < ' ') b.AppendFormat("\\u{0:x4}", (int)c);
            else b.Append(c);
        }
        return b.Append('"').ToString();
    }
}
