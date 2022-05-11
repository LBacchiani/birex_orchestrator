import matplotlib.pyplot as plt

LANG="en_US.UTF-8"
LANGUAGE="en_US.UTF-8"
LC_ALL="en_US.UTF-8"

latency = {}
byte = {}
time = 0

def process_line(line):
    x = line[:-2].split("(")[-1].split(",")
    lat, by = float(x[0]), float(x[1]) / 10**6
    return lat, by


with open("logs.txt", encoding='utf-8') as file:
    for line in file.readlines():
        l, b = process_line(line)
        latency[time] = l
        byte[time] = b
        time += 2


x = list(latency.keys())
y_lat = list(latency.values())
y_byte = list(byte.values())

fig, ax1 = plt.subplots()
ax1.set_xlim(0, 80)
ax1.set_ylim(0,2000)
ax1.set_xlabel('Time (min)')
ax1.set_ylabel('Latency (ms)', color='black')
ax1.plot(x, y_lat, color='green', label="Latency")
ax1.tick_params(axis='y')
ax1.fill_between(x, y_lat, color='lightgreen')
ax1.legend(loc='upper center', ncol=1, frameon=False)

ax1.plot([20], [547.8333333333333], 'o', color='blue')
ax1.text(20.5, 547.8333333333333, "cloud->edge")

ax1.plot([46], [1262.5], 'o', color='orange')
ax1.text(46.5, 1262.5, "edge->cloud")

ax1.plot([72], [570.8333333333333], 'o', color='blue')
ax1.text(63, 571.8333333333333, "cloud->edge")

ax2 = ax1.twinx()  # instantiate a second axes that shares the same x-axis
ax2.set_ylim(-0.000001,85)
ax2.set_ylabel('MB Sent', color='black')  # we already handled the x-label with ax1
ax2.plot(x, y_byte, color='black', linestyle='dashed', label="MB Sent")
ax2.tick_params(axis='y')
ax2.legend(loc='upper right', ncol=1, frameon=False)

fig.tight_layout()  # otherwise the right y-label is slightly clipped
plt.show()

