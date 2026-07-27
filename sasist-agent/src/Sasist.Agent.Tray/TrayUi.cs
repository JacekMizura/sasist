namespace Sasist.Agent.Tray;

internal static class TrayUi
{
    public static Panel CreateCard(int left, int top, int width, int height)
    {
        var card = new Panel
        {
            Left = left,
            Top = top,
            Width = width,
            Height = height,
            BackColor = Color.White,
        };
        card.Paint += (_, e) =>
        {
            using var pen = new Pen(Color.FromArgb(230, 230, 235));
            e.Graphics.DrawRectangle(pen, 0, 0, card.Width - 1, card.Height - 1);
        };
        return card;
    }
}
