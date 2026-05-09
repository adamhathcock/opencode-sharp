namespace SampleProject;

public sealed class Calculator : ICalculator
{
    public int Add(int left, int right) => left + right;

    public int Double(int value)
    {
        var total = Add(value, value);
        return total;
    }
}
