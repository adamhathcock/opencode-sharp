namespace SampleProject;

public sealed class Consumer
{
    private readonly ICalculator calculator = new Calculator();

    public int Compute()
    {
        return calculator.Add(1, 2);
    }
}
